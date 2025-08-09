import React, { useEffect } from "react";
import AppRouter from "./routes/AppRouter";
import './index.css';

function App() {
  useEffect(() => {
    console.log("✅ API KEY 확인:", process.env.REACT_APP_GOOGLE_API_KEY);
  }, []);

  return <AppRouter />;
}

export default App;
