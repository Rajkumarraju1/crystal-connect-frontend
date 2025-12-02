 import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import "../glass.css";

const SIGNALING_URL = "https://crystal-connect-backend.onrender.com";

 

export default function VideoChat() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const pcRef = useRef(null);
  const socketRef = useRef(null);
  const roomRef = useRef(null);
  const partnerRef = useRef(null);
  const isInitiatorRef = useRef(false);

  const [status, setStatus] = useState("idle");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  // ------------------ SOCKET SETUP ------------------
  useEffect(() => {
    socketRef.current = io(SIGNALING_URL, { transports: ["websocket"] });

    socketRef.current.on("connect", () => {
      joinQueue();
    });

    socketRef.current.on("waiting", () => setStatus("waiting"));

    socketRef.current.on("matched", ({ roomId, partner }) => {
      roomRef.current = roomId;
      partnerRef.current = partner;
      isInitiatorRef.current = socketRef.current.id < partner;

      setStatus("matched");
      startCall(isInitiatorRef.current);
    });

    socketRef.current.on("signal", async ({ from, data }) => {
      if (!pcRef.current) await startCall(false);
      if (!data) return;

      try {
        if (data.type === "offer") {
          await pcRef.current.setRemoteDescription(data);
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);

          socketRef.current.emit("signal", {
            roomId: roomRef.current,
            to: from,
            data: pcRef.current.localDescription,
          });
        } else if (data.type === "answer") {
          await pcRef.current.setRemoteDescription(data);
        } else if (data.candidate) {
          await pcRef.current.addIceCandidate(data);
        }
      } catch (error) {
        console.log("Signal error:", error);
      }
    });

    socketRef.current.on("chat-message", ({ message }) => {
      setMessages((m) => [...m, { from: "partner", text: message }]);
    });

    socketRef.current.on("partner-disconnected", () => {
      cleanupCall();
      setStatus("partner-disconnected");
      setTimeout(joinQueue, 1500);
    });

    socketRef.current.on("partner-skipped", () => {
      cleanupCall();
      setStatus("partner-skipped");
      setTimeout(joinQueue, 1500);
    });

    return () => socketRef.current.disconnect();
  }, []);

  // ------------------ MEDIA SETUP ------------------
  async function getMedia() {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
      audio: true,
    });
  }

  // ------------------ WEBRTC CALL SETUP ------------------
  async function startCall(isInitiator) {
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {}
    }

    pcRef.current = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
        {
          urls: "turn:openrelay.metered.ca:443",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
      ],
    });

    pcRef.current.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current.emit("signal", {
          roomId: roomRef.current,
          to: partnerRef.current,
          data: e.candidate,
        });
      }
    };

    pcRef.current.ontrack = (e) => {
      remoteVideoRef.current.srcObject = e.streams[0];
    };

    const stream = await getMedia();
    localVideoRef.current.srcObject = stream;

    stream.getTracks().forEach((track) =>
      pcRef.current.addTrack(track, stream)
    );

    if (isInitiator) {
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);

      socketRef.current.emit("signal", {
        roomId: roomRef.current,
        to: partnerRef.current,
        data: offer,
      });
    }
  }

  // ------------------ UTILITIES ------------------
  function cleanupCall() {
    if (pcRef.current) pcRef.current.close();
    pcRef.current = null;

    localVideoRef.current.srcObject = null;
    remoteVideoRef.current.srcObject = null;
  }

  function joinQueue() {
    setStatus("joining");
    socketRef.current.emit("join");
  }

  function sendMessage() {
    if (!input.trim()) return;

    setMessages((m) => [...m, { from: "me", text: input }]);
    socketRef.current.emit("chat-message", {
      roomId: roomRef.current,
      message: input,
    });

    setInput("");
  }

  return (
    <div className="videochat-wrapper">

      <div className="status-text">
        Status: <strong>{status}</strong>
      </div>

      {/* VIDEO SECTION */}
      <div className="glass-card video-section">

        <h2 className="section-title">Video Chat</h2>

        <div className="video-grid">
          <div className="video-block">
            <span className="video-label">Local</span>
            <div className="video-box">
              <video ref={localVideoRef} autoPlay muted playsInline></video>
            </div>
          </div>

          <div className="video-block">
            <span className="video-label">Remote</span>
            <div className="video-box">
              <video ref={remoteVideoRef} autoPlay playsInline></video>
            </div>
          </div>
        </div>

        <div className="controls-row">
          <button className="btn" onClick={joinQueue}>Join</button>
          <button className="btn" onClick={() => socketRef.current.emit("skip", roomRef.current)}>Skip</button>
          <button className="btn red" onClick={cleanupCall}>Disconnect</button>
        </div>

      </div>

      {/* CHAT + NOTES */}
      <div className="lower-section">

        <div className="chat-area">
          <h3>Chat</h3>

          <div className="chat-panel">
            {messages.map((m, i) => (
              <div key={i} className={m.from === "me" ? "msg me" : "msg"}>
                <div className="msg-text">{m.text}</div>
              </div>
            ))}
          </div>

          <div className="chat-input-box">
            <input
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type message..."
            />
            <button className="btn" onClick={sendMessage}>Send</button>
          </div>
        </div>

        <div className="glass-card notes-card">
          <h3>Notes</h3>
          <ul>
            <li>Allow camera & microphone access.</li>
            <li>TURN improves connection reliability.</li>
            <li>Best experience on Chrome mobile & desktop.</li>
          </ul>
        </div>

      </div>
    </div>
  );
}
