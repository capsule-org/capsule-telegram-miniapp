import React, { useState, useEffect } from "react";
import WebApp from "@twa-dev/sdk";
import { CloudStorageKey, CloudStorageValue, telegramCloudStorage } from "./lib/telegramCloudStorage";
import capsuleClient from "./lib/capsuleClient";
import { WalletType } from "@usecapsule/web-sdk";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Spinner } from "./components/ui/spinner"; // Assume you have a Spinner component

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [userShare, setUserShare] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [logs, setLogs] = useState<Array<{ message: string; type: "info" | "error" | "success" }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");

  useEffect(() => {
    WebApp.ready();
    handleAuth();
  }, []);

  const log = (message: string, type: "info" | "error" | "success" = "info") => {
    setLogs((prevLogs) => [...prevLogs, { message, type }]);
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    log(errorMessage, "error");
  };

  const storeWithChunking = async (
    key: CloudStorageKey,
    value: CloudStorageValue,
    maxRetries: number = 256
  ): Promise<number> => {
    const store = (k: CloudStorageKey, v: CloudStorageValue): Promise<void> => {
      return new Promise((resolve, reject) => {
        telegramCloudStorage.setItem(k, v, (error) => {
          if (error) {
            reject(error);
          } else resolve();
        });
      });
    };

    const storeRecursive = async (
      baseKey: CloudStorageKey,
      subValue: CloudStorageValue,
      chunkIndex: number = 0,
      depth: number = 0
    ): Promise<number> => {
      if (depth > maxRetries) {
        throw new Error(`Failed to store after ${maxRetries} splitting attempts`);
      }

      const chunkKey = `${baseKey}_chunk_${chunkIndex}`;

      try {
        await store(chunkKey, subValue);
        return 1;
      } catch (error) {
        const midPoint = Math.ceil(subValue.length / 2);
        const leftHalf = subValue.slice(0, midPoint);
        const rightHalf = subValue.slice(midPoint);

        const leftCount = await storeRecursive(baseKey, leftHalf, chunkIndex * 2 + 1, depth + 1);
        const rightCount = await storeRecursive(baseKey, rightHalf, chunkIndex * 2 + 2, depth + 1);

        await store(`${chunkKey}_meta`, JSON.stringify({ split: true, chunks: leftCount + rightCount }));

        return leftCount + rightCount;
      }
    };

    try {
      const totalChunks = await storeRecursive(key, value);
      await store(`${key}_meta`, JSON.stringify({ totalChunks }));
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

    const retrieveRecursive = async (baseKey: CloudStorageKey, chunkIndex: number = 0): Promise<CloudStorageValue> => {
      const chunkKey = `${baseKey}_chunk_${chunkIndex}`;
      try {
        const metaData = await retrieve(`${chunkKey}_meta`);
        if (metaData) {
          const { split, chunks } = JSON.parse(metaData) as { split: boolean; chunks: number };
          log(`Retrieving ${chunks} chunks for ${chunkKey}`);
          if (split) {
            const leftData = await retrieveRecursive(baseKey, chunkIndex * 2 + 1);
            const rightData = await retrieveRecursive(baseKey, chunkIndex * 2 + 2);
            return leftData + rightData;
          }
        }
        const data = await retrieve(chunkKey);
        if (data === undefined) {
          throw new Error(`No data found for key ${chunkKey}`);
        }
        return data;
      } catch (error) {
        handleError(`Error retrieving chunk ${chunkKey}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    };

    try {
      const metaData = await retrieve(`${key}_meta`);
      if (!metaData) {
        throw new Error(`No metadata found for key ${key}`);
      }
      const { totalChunks } = JSON.parse(metaData) as { totalChunks: number };
      log(`Retrieving data for "${key}" (${totalChunks} chunks)`);
      const data = await retrieveRecursive(key);
      log(`Successfully retrieved and recombined data for "${key}"`);

      return data;
    } catch (error) {
      handleError(`Failed to retrieve data for "${key}": ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  };

  const generateWallet = async (): Promise<void> => {
    setIsLoading(true);
    setLoadingText("Generating wallet...");
    try {
      const username = WebApp.initDataUnsafe.user?.username;
      if (!username) throw new Error("Username not found");
      const pregenWallet = await capsuleClient.createWalletPreGen(
        WalletType.EVM,
        `${username + crypto.randomUUID().split("-")[0]}@test.usecapsule.com`
      );
      log(`Wallet created with ID: ${pregenWallet.id}`, "success");
      setWalletId(pregenWallet.id);
      const share = (await capsuleClient.getUserShare()) || "";
      setUserShare(share);

      log("Storing wallet data...", "info");
      await storeWithChunking("walletId", pregenWallet.id);
      await storeWithChunking("userShare", share);
      log("Wallet data stored successfully", "success");
    } catch (error) {
      handleError(`Error generating wallet: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
      setLoadingText("");
    }
  };

  const checkExistingWallet = async (): Promise<void> => {
    setIsLoading(true);
    setLoadingText("Checking for existing wallet...");
    try {
      const walletId = await retrieveChunkedData("walletId");
      const userShare = await retrieveChunkedData("userShare");

      if (walletId && userShare) {
        setWalletId(walletId);
        setUserShare(userShare);
        log("Existing wallet found", "success");
      } else {
        log("No existing wallet found", "info");
      }
    } catch (error) {
      handleError(`Error fetching wallet data: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
      setLoadingText("");
    }
  };

  const handleAuth = async () => {
    setIsLoading(true);
    setLoadingText("Authenticating...");
    try {
      if (WebApp.initDataUnsafe.user) {
        log("User authenticated", "success");
        setIsAuthenticated(true);
        await checkExistingWallet();
      } else {
        handleError("User data not available");
      }
    } catch (error) {
      handleError(`Authentication error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
      setLoadingText("");
    }
  };

  const signMessage = async () => {
    if (!walletId || !userShare) {
      handleError("Wallet ID or User Share not available");
      return;
    }

    setIsLoading(true);
    setLoadingText("Signing message...");
    try {
      await capsuleClient.setUserShare(userShare);
      const messageBase64 = btoa(message);
      const sig = await capsuleClient.signMessage(walletId, messageBase64);

      if ("transactionReviewUrl" in sig) {
        throw new Error("Error signing message");
      }
      setSignature(sig.signature);
      log(`Message signed successfully`, "success");
    } catch (error) {
      handleError(`Error signing message: ${error}`);
    } finally {
      setIsLoading(false);
      setLoadingText("");
    }
  };

  const logout = () => {
    log("Logging out...", "info");
    WebApp.close();
  };

  const clearStorage = async () => {
    setIsLoading(true);
    setLoadingText("Clearing storage...");
    try {
      const keys: string[] = await new Promise((resolve, reject) => {
        telegramCloudStorage.getKeys((error, result) => {
          if (error) reject(error);
          else resolve(result || []);
        });
      });

      const removeItem = (key: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          telegramCloudStorage.removeItem(key, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      };

      for (const key of keys) {
        if (key.endsWith("_meta")) {
          const baseKey = key.replace("_meta", "");
          const metaData = await new Promise<string | undefined>((resolve, reject) => {
            telegramCloudStorage.getItem(key, (error, result) => {
              if (error) reject(error);
              else resolve(result);
            });
          });

          if (metaData) {
            const { totalChunks } = JSON.parse(metaData);
            for (let i = 0; i < totalChunks; i++) {
              await removeItem(`${baseKey}_chunk_${i}`);
              await removeItem(`${baseKey}_chunk_${i}_meta`);
            }
          }
        }
        await removeItem(key);
      }

      log("Storage cleared successfully", "success");
      setWalletId(null);
      setUserShare(null);
      setMessage("");
      setSignature("");
      setLogs([]);
      setError(null);
    } catch (error) {
      handleError(`Error clearing storage: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
      setLoadingText("");
    }
  };

  return (
    <div className="container mx-auto p-4">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{isAuthenticated ? "Wallet Manager" : "Welcome to Capsule Wallet"}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-hidden">
          {!isAuthenticated ? (
            <p>Authenticating...</p>
          ) : !walletId ? (
            <Button
              onClick={generateWallet}
              disabled={isLoading}>
              {isLoading ? <Spinner /> : "Generate Wallet"}
            </Button>
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
                className="mb-2"
                disabled={isLoading || !message}>
                {isLoading ? <Spinner /> : "Sign Message"}
              </Button>
              {signature && <p className="mb-2 break-all">Signature: {signature}</p>}
              <div className="flex justify-between">
                <Button
                  onClick={logout}
                  disabled={isLoading}>
                  Close App
                </Button>
                <Button
                  onClick={clearStorage}
                  className="ml-2"
                  disabled={isLoading}>
                  Clear Storage
                </Button>
              </div>
            </>
          )}
          {loadingText && <p className="mt-2">{loadingText}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>App Logs</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto max-h-60">
          {logs.length === 0 ? (
            <p>No logs yet.</p>
          ) : (
            logs.map((log, index) => (
              <p
                key={index}
                className={`${log.type === "error" ? "text-red-500" : log.type === "success" ? "text-green-500" : ""}`}>
                {log.message}
              </p>
            ))
          )}
        </CardContent>
      </Card>

      {error && (
        <Alert
          variant="destructive"
          className="mt-4">
          <AlertDescription className="break-words">{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default App;
