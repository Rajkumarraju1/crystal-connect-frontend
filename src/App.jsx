import React from "react";
import VideoChat from "./components/VideoChat";
import logo from "./assets/CrystalConnect.png";
import "./glass.css";

export default function App() {
  return (
    <div className="app-wrapper">

      {/* Header */}
      <header className="app-header">
        <img src={logo} alt="CrystalConnect" className="app-logo" />
        <h1 className="app-title">CrystalConnect</h1>
      </header>

      <VideoChat />
    </div>
  );
}
