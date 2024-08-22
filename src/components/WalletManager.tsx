import React, { useState, useEffect } from "react";
import WebApp from "@twa-dev/sdk";
import { telegramCloudStorage } from "../lib/telegramCloudStorage";
import capsuleClient from "../lib/capsuleClient";
import { WalletType } from "@usecapsule/web-sdk";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const WalletManager: React.FC = () => {
  const [walletId, setWalletId] = useState<string | null>(null);
  const [userShare, setUserShare] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");

  useEffect(() => {
    const checkExistingWallet = () => {
      telegramCloudStorage.getItems(["walletId", "userShare"], (error, result) => {
        if (error) {
          console.error("Error fetching wallet data:", error);
          return;
        }
        if (result && result.walletId && result.userShare) {
          setWalletId(result.walletId);
          setUserShare(result.userShare);
        }
      });
    };
    checkExistingWallet();
  }, []);

  const generateWallet = async () => {
    try {
      const username = WebApp.initDataUnsafe.user?.username;
      if (!username) throw new Error("Username not found");

      const pregenWallet = await capsuleClient.createWalletPreGen(WalletType.EVM, username);
      const share = (await capsuleClient.getUserShare()) || "";

      telegramCloudStorage.setItem("walletId", pregenWallet.id, (error) => {
        if (error) {
          console.error("Error storing wallet ID:", error);
          return;
        }
        setWalletId(pregenWallet.id);
      });

      telegramCloudStorage.setItem("userShare", share, (error) => {
        if (error) {
          console.error("Error storing user share:", error);
          return;
        }
        setUserShare(share);
      });
    } catch (error) {
      console.error("Error generating wallet:", error);
    }
  };

  const signMessage = async () => {
    if (!walletId || !userShare) return;

    try {
      await capsuleClient.setUserShare(userShare);
      const messageBase64 = btoa(message);
      const sig = await capsuleClient.signMessage(walletId, messageBase64);

      if ("transactionReviewUrl" in sig) {
        throw new Error("Error signing message");
      }
      setSignature(sig.signature);
    } catch (error) {
      console.error("Error signing message:", error);
    }
  };

  const logout = () => {
    telegramCloudStorage.removeItems(["walletId", "userShare"], (error) => {
      if (error) {
        console.error("Error removing wallet data:", error);
        return;
      }
      setWalletId(null);
      setUserShare(null);
      setSignature("");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Wallet Manager</CardTitle>
      </CardHeader>
      <CardContent>
        {!walletId ? (
          <Button onClick={generateWallet}>Generate Wallet</Button>
        ) : (
          <>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter message to sign"
            />
            <Button onClick={signMessage}>Sign Message</Button>
            {signature && <p>Signature: {signature}</p>}
            <Button onClick={logout}>Logout</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WalletManager;
