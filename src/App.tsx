import React, { useState, useEffect } from "react";
import WebApp from "@twa-dev/sdk";
import { telegramCloudStorage } from "./lib/telegramCloudStorage";
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
    console.log(WebApp.version);
    checkExistingWallet();
  }, []);

  const log = (message: string) => {
    setLogs((prevLogs) => [...prevLogs, message]);
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    log(`Error: ${errorMessage}`);
  };

  const checkExistingWallet = () => {
    log("Checking for existing wallet...");
    telegramCloudStorage.getItems(["walletId", "userShare"], (error, result) => {
      if (error) {
        handleError(`Error fetching wallet data: ${error}`);
        return;
      }
      if (result && result.walletId && result.userShare) {
        setWalletId(result.walletId);
        setUserShare(result.userShare);
        log("Existing wallet found");
      } else {
        log("No existing wallet found");
      }
    });
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

  const generateWallet = async () => {
    try {
      log("Generating new wallet...");
      const username = WebApp.initDataUnsafe.user?.username;
      if (!username) throw new Error("Username not found");

      const pregenWallet = await capsuleClient.createWalletPreGen(WalletType.EVM, username);
      log(`Wallet created with ID: ${pregenWallet.id}`);
      const share = (await capsuleClient.getUserShare()) || "";
      log("User share obtained");

      telegramCloudStorage.setItem("walletId", pregenWallet.id, (error) => {
        if (error) {
          handleError(`Error storing wallet ID: ${error}`);
          return;
        }
        setWalletId(pregenWallet.id);
        log("Wallet ID stored in Telegram Cloud Storage");
      });

      telegramCloudStorage.setItem("userShare", share, (error) => {
        if (error) {
          handleError(`Error storing user share: ${error}`);
          return;
        }
        setUserShare(share);
        log("User share stored in Telegram Cloud Storage");
      });
    } catch (error) {
      handleError(`Error generating wallet: ${error}`);
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
    telegramCloudStorage.removeItems(["walletId", "userShare"], (error) => {
      if (error) {
        handleError(`Error removing wallet data: ${error}`);
        return;
      }
      setWalletId(null);
      setUserShare(null);
      setSignature("");
      setIsAuthenticated(false);
      log("Logged out successfully");
    });
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
