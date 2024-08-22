import React, { useEffect } from "react";
import WebApp from "@twa-dev/sdk";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";

interface AuthProps {
  onAuthenticate: () => void;
}

const Auth: React.FC<AuthProps> = ({ onAuthenticate }) => {
  useEffect(() => {
    if (WebApp.initDataUnsafe.user) {
      handleAuth();
    }
  }, []);

  const handleAuth = async () => {
    if (WebApp.initDataUnsafe.user) {
      console.log("User authenticated:", WebApp.initDataUnsafe.user);
      onAuthenticate();
    } else {
      console.error("User data not available");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome to Capsule Wallet</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Click the button below to start using the app.</p>
        <Button onClick={handleAuth}>Start</Button>
      </CardContent>
    </Card>
  );
};

export default Auth;
