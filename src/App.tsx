import React, { useState, useEffect } from "react";
import WebApp from "@twa-dev/sdk";
import { CloudStorageKey, CloudStorageValue, telegramCloudStorage } from "./lib/telegramCloudStorage";
import capsuleClient from "./lib/capsuleClient";
import { WalletType } from "@usecapsule/web-sdk";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Alert, AlertDescription } from "./components/ui/alert";

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [userShare, setUserShare] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    WebApp.ready();
    checkExistingWallet();
  }, []);

  const log = (message: string) => {
    setLogs((prevLogs) => [...prevLogs, message]);
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    log(`Error: ${errorMessage}`);
  };

  const storeWithChunking = async (
    key: CloudStorageKey,
    value: CloudStorageValue,
    maxRetries: number = 6
  ): Promise<number> => {
    const store = (k: CloudStorageKey, v: CloudStorageValue): Promise<void> => {
      return new Promise((resolve, reject) => {
        telegramCloudStorage.setItem(k, v, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    };

    const storeRecursive = async (
      subKey: CloudStorageKey,
      subValue: CloudStorageValue,
      depth: number = 0
    ): Promise<number> => {
      if (depth > maxRetries) {
        throw new Error(`Failed to store after ${maxRetries} splitting attempts`);
      }

      try {
        await store(subKey, subValue);
        return 1; // Return 1 to count this successful chunk
      } catch (error) {
        // If storage fails, split the value and try again
        const midPoint = Math.ceil(subValue.length / 2);
        const leftHalf = subValue.slice(0, midPoint);
        const rightHalf = subValue.slice(midPoint);

        const leftCount = await storeRecursive(`${subKey}:L`, leftHalf, depth + 1);
        const rightCount = await storeRecursive(`${subKey}:R`, rightHalf, depth + 1);

        // Store metadata about this split
        await store(`${subKey}:meta`, JSON.stringify({ split: true, chunks: leftCount + rightCount }));

        return leftCount + rightCount; // Return total number of chunks created
      }
    };

    try {
      const totalChunks = await storeRecursive(key, value);
      log(`Successfully stored "${key}" in ${totalChunks} chunk(s)`);
      return totalChunks;
    } catch (error) {
      handleError(`Failed to store "${key}": ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  };

  const retrieveChunkedData = async (key: CloudStorageKey): Promise<CloudStorageValue> => {
    const retrieve = (k: CloudStorageKey): Promise<CloudStorageValue | undefined> => {
      return new Promise((resolve, reject) => {
        telegramCloudStorage.getItem(k, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
      });
    };

    const retrieveRecursive = async (subKey: CloudStorageKey): Promise<CloudStorageValue> => {
      try {
        const metaData = await retrieve(`${subKey}:meta`);
        if (metaData) {
          const { split, chunks } = JSON.parse(metaData) as { split: boolean; chunks: number };
          log(`Retrieving ${chunks} chunks for ${subKey}`);
          if (split) {
            const leftData = await retrieveRecursive(`${subKey}:L`);
            const rightData = await retrieveRecursive(`${subKey}:R`);
            return leftData + rightData;
          }
        }
        // If no metadata or not split, return the data directly
        const data = await retrieve(subKey);
        if (data === undefined) {
          throw new Error(`No data found for key ${subKey}`);
        }
        return data;
      } catch (error) {
        handleError(`Error retrieving chunk ${subKey}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    };

    try {
      const data = await retrieveRecursive(key);
      log(`Successfully retrieved and recombined data for "${key}"`);
      return data;
    } catch (error) {
      handleError(`Failed to retrieve data for "${key}": ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  };

  const generateWallet = async (): Promise<void> => {
    try {
      log("Generating new wallet...");
      const username = WebApp.initDataUnsafe.user?.username;
      if (!username) throw new Error("Username not found");
      const pregenWallet = await capsuleClient.createWalletPreGen(WalletType.EVM, `${username}@test.usecapsule.com`);
      log(`Wallet created with ID: ${pregenWallet.id}`);
      log(`Wallet address: ${pregenWallet.address}`);
      log(`Wallet pregenIdentifier: ${pregenWallet.pregenIdentifier}`);
      const share = (await capsuleClient.getUserShare()) || "";
      log("User share obtained");

      await storeWithChunking("walletId", pregenWallet.id);
      setWalletId(pregenWallet.id);
      log("Wallet ID stored in Telegram Cloud Storage");

      const userShareChunks = await storeWithChunking("userShare", share);
      setUserShare(share);
      log(`User share stored in Telegram Cloud Storage in ${userShareChunks} chunk(s)`);
    } catch (error) {
      handleError(`Error generating wallet: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const checkExistingWallet = async (): Promise<void> => {
    log("Checking for existing wallet...");
    try {
      const walletId = await retrieveChunkedData("walletId");
      const userShare = await retrieveChunkedData("userShare");

      if (walletId && userShare) {
        setWalletId(walletId);
        setUserShare(userShare);
        log("Existing wallet found");
      } else {
        log("No existing wallet found");
      }
    } catch (error) {
      handleError(`Error fetching wallet data: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleAuth = async () => {
    log("Attempting authentication...");
    if (WebApp.initDataUnsafe.user) {
      log("User authenticated: " + JSON.stringify(WebApp.initDataUnsafe.user));
      setIsAuthenticated(true);
    } else {
      handleError("User data not available");
    }
  };

  const signMessage = async () => {
    if (!walletId || !userShare) {
      handleError("Wallet ID or User Share not available");
      return;
    }

    try {
      log("Setting user share...");
      await capsuleClient.setUserShare(userShare);
      log("User share set successfully");

      log("Signing message...");
      const messageBase64 = btoa(message);
      const sig = await capsuleClient.signMessage(walletId, messageBase64);

      if ("transactionReviewUrl" in sig) {
        throw new Error("Error signing message");
      }
      setSignature(sig.signature);
      log(`Message signed successfully. Signature: ${sig.signature}`);
    } catch (error) {
      handleError(`Error signing message: ${error}`);
    }
  };

  const logout = () => {
    log("Logging out...");
    WebApp.close();
  };

  return (
    <div className="container mx-auto p-4">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{isAuthenticated ? "Wallet Manager" : "Welcome to Capsule Wallet"}</CardTitle>
        </CardHeader>
        <CardContent>
          {!isAuthenticated ? (
            <>
              <p>Click the button below to start using the app.</p>
              <Button onClick={handleAuth}>Start</Button>
            </>
          ) : !walletId ? (
            <Button onClick={generateWallet}>Generate Wallet</Button>
          ) : (
            <>
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter message to sign"
                className="mb-2"
              />
              <Button
                onClick={signMessage}
                className="mb-2">
                Sign Message
              </Button>
              {signature && <p className="mb-2">Signature: {signature}</p>}
              <Button onClick={logout}>Logout</Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>App Logs</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.map((log, index) => (
            <p key={index}>{log}</p>
          ))}
        </CardContent>
      </Card>

      {error && (
        <Alert
          variant="destructive"
          className="mt-4 text-wrap">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default App;
