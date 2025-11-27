 import React from 'react';
import VideoChat from './components/VideoChat';
import logo from "./assets/CrystalConnect.png";

export default function App() {
  return (
    <div className="container">
        <img src={logo} alt="CrystalConnect" className="logo" style={{width:"200px", marginLeft:"-10rem" , marginTop:"-5rem"}} />
      <h1 style={{ marginTop:"-3rem"}}>CrystalConnect</h1>
      <VideoChat />
    </div>
  );
}
