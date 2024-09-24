import React, { useState, useEffect } from "react";
import WebApp from "@twa-dev/sdk";
import capsuleClient from "./lib/capsuleClient";
import { WalletType } from "@usecapsule/web-sdk";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Spinner } from "./components/ui/spinner";
import {
  clearChunkedStorage,
  ErrorHandler,
  LogFunction,
  retrieveChunkedData,
  storeWithChunking,
} from "./lib/cloudStorageUtil";

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [address, setAddress] = useState<string | undefined>("");
  const [userShare, setUserShare] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [logs, setLogs] = useState<Array<{ message: string; type: "info" | "error" | "success" }>>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [isStorageComplete, setIsStorageComplete] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    setIsLoading(true);
    setLoadingText("Initializing Capsule Telegram Mini App Demo...");

    try {
      WebApp.ready();

      if (!WebApp.initDataUnsafe.user) {
        throw new Error("No User found. Please open App from Telegram");
      }

      log(`User authenticated: ${WebApp.initDataUnsafe.user.username}`, "success");
      setIsAuthenticated(true);
      setLoadingText(
        `Checking ${WebApp.initDataUnsafe.user.username}'s telegram cloud storage for existing wallet data...`
      );
      const userShare = await retrieveChunkedData("userShare", log, handleError);
      const walletId = await retrieveChunkedData("walletId", log, handleError);

      if (userShare && walletId) {
        setUserShare(userShare);
        setWalletId(walletId);
        setIsStorageComplete(true);
        log(`Wallet data found: ${walletId}`, "success");
        await capsuleClient.setUserShare(userShare);
      } else {
        log(`No existing wallet data found for user ${WebApp.initDataUnsafe.user.username}`, "info");
      }
    } catch (error) {
      handleError(`Initialization error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
      setLoadingText("");
    }
  };

  const log: LogFunction = (message, type) => {
    setLogs((prevLogs) => [...prevLogs, { message, type }]);
  };

  const handleError: ErrorHandler = (errorMessage) => log(errorMessage, "error");

  const generateWallet = async (): Promise<void> => {
    setIsLoading(true);
    setLoadingText("Generating a new wallet...");
    try {
      const username = WebApp.initDataUnsafe.user?.username;
      if (!username) throw new Error("Username not found");

      const pregenWallet = await capsuleClient.createWalletPreGen(
        WalletType.EVM,
        `${username + crypto.randomUUID().split("-")[0]}@test.usecapsule.com`
      );

      log(`Wallet created with ID: ${pregenWallet.id} and Address: ${pregenWallet.address || "N/A"}`, "success");

      const share = (await capsuleClient.getUserShare()) || "";

      // Update state immediately
      setUserShare(share);
      setAddress(pregenWallet.address);
      setWalletId(pregenWallet.id);

      // Start asynchronous storage operations
      log("Storing the wallet data in users telegram cloud storage...", "info");
      log("This may take a few seconds. The wallet is now usable, but please DO NOT close the mini-app while this is in progress", "info");

      Promise.all([
        storeWithChunking("userShare", share, log, handleError),
        storeWithChunking("walletId", pregenWallet.id, log, handleError),
      ])
        .then(() => {
          log("Wallet data stored successfully", "success");
          setIsStorageComplete(true);
        })
        .catch((error) => {
          handleError(`Error storing wallet data: ${error instanceof Error ? error.message : String(error)}`);
          setIsStorageComplete(true);
        });
    } catch (error) {
      handleError(`Error generating wallet: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
      setLoadingText("");
    }
  };
  const signMessage = async () => {
    if (!walletId || !userShare) {
      handleError("Wallet ID or User Share not available to sign message");
      return;
    }

    setIsLoading(true);
    setLoadingText(`Signing message "${message}"...`);
    try {
      await capsuleClient.setUserShare(userShare);
      const messageBase64 = btoa(message);
      const sig = await capsuleClient.signMessage(walletId, messageBase64);

      if ("transactionReviewUrl" in sig) {
        throw new Error(`Error: Transaction review required: ${sig.transactionReviewUrl}`);
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

  const clearStorage = async () => {
    setIsLoading(true);
    setLoadingText("Clearing storage and resetting state...");
    try {
      await clearChunkedStorage(log, handleError);
      setUserShare(null);
      setWalletId(null);
      setIsStorageComplete(false);
      log("Finished clearing storage and resetting state", "success");
    } catch (error) {
      handleError(`Error clearing storage: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
      setLoadingText("");
    }
  };

  const logout = () => {
    log("Logging out...", "info");
    WebApp.close();
  };

  return (
    <div className="container mx-auto p-4">
      <div className="header">
        <Button variant={"link"}>
          <a href="https://usecapsule.com" target="_blank">Capsule</a>
        </Button>
        <Button variant={"link"}>
          <a href="https://docs.usecapsule.com" target="_blank">Docs</a>
        </Button>
        <Button variant={"link"}>
          <a href="https://developer.usecapsule.com" target="_blank">Get Access</a>
        </Button>
        <Button
          variant={"link"}
          onClick={logout}
          disabled={!isStorageComplete}>
          ❌ Close App
        </Button>
      </div>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{isAuthenticated ? "Wallet Manager" : "Capsule TG App Example"}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-hidden">
          {!isAuthenticated ? (
            <p>Authenticating...</p>
          ) : !walletId ? (
            <div className="flex justify-between">
              <Button
                onClick={generateWallet}
                disabled={isLoading}>
                {isLoading ? <Spinner /> : "Create New Wallet"}
              </Button>
              <p></p>
            </div>
          ) : (
            <>
              <p className="text-[12px]">{`Wallet Address: ${address}`}</p>
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Message to sign"
                className="mb-2 bg-card"
              />
              <Button
                variant={"outline"}
                onClick={signMessage}
                className="mb-2"
                disabled={isLoading || !message}>
                {isLoading ? <Spinner /> : "Sign Message"}
              </Button>
              {signature && <p className="mb-2 break-all">Signature: {signature}</p>}
              <div>
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
        <CardHeader className="flex justify-between flex-row">
          <CardTitle>App Logs</CardTitle>
          <Button
            size={"sm"}
            variant={"outline"}
            onClick={() => setShowLogs(!showLogs)}>
            {showLogs ? 'Hide' : 'Show'}
          </Button>
          <Button
            size={"sm"}
            disabled={logs.length === 0}
            variant={"outline"}
            onClick={() => setLogs([])}>
            Clear
          </Button>
        </CardHeader>
        <CardContent className="overflow-auto max-h-60">
          <p>{userShare ? (isStorageComplete ? `Wallet Stored: ✅` : `Wallet Stored: In Progress`) : ``}</p>
          <p>{userShare ? (isLoading ? `Wallet Fetched: In Progress` : `Wallet Fetched: ✅`) : ``}</p>
          <div className="font-mono text-[12px]">
            {!!showLogs && (
              logs.length === 0 ? (
                <p>No logs yet.</p>
              ) : (
                logs.map((log, index) => (
                  <p
                    key={index}
                    className={`${log.type === "error" ? "text-red-500" : log.type === "success" ? "text-green-500" : ""}`}>
                    {log.message}
                  </p>
                ))
              ))
            }
          </div>
          </CardContent>
      </Card>
    </div>
  );
};

export default App;
