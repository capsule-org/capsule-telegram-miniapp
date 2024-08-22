import React, { useState, useEffect } from "react";
import WebApp from "@twa-dev/sdk";
import Auth from "./components/Auth";
import WalletManager from "./components/WalletManager";

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    WebApp.ready();
  }, []);

  return (
    <div className="container mx-auto p-4">
      {isAuthenticated ? <WalletManager /> : <Auth onAuthenticate={() => setIsAuthenticated(true)} />}
    </div>
  );
};

export default App;
