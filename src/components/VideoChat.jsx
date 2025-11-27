import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client"; 
import "../glass.css";


const SIGNALING_URL = "https://gastric-swan-crystalconnect-975fa1db.koyeb.app";



export default function VideoChat() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const socketRef = useRef(null);
  const roomRef = useRef(null);
  const partnerRef = useRef(null);
  const isInitiatorRef = useRef(false); // whether this client should create the offer

  const [status, setStatus] = useState("idle");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    socketRef.current = io(SIGNALING_URL, { transports: ["websocket"] });

    socketRef.current.on("connect", () => {
      console.log("Connected:", socketRef.current.id);
      joinQueue();
    });

    socketRef.current.on("waiting", () => setStatus("waiting"));

    // matched will include partner id; we determine initiator client-side
    socketRef.current.on("matched", ({ roomId, partner }) => {
      roomRef.current = roomId;
      partnerRef.current = partner;

      // decide initiator deterministically so only one side creates the offer
      // smaller socket id string will initiate
      isInitiatorRef.current = socketRef.current.id < partnerRef.current;

      setStatus("matched");
      // startCall will use isInitiatorRef to decide whether to createOffer
      startCall(isInitiatorRef.current);
    });

    socketRef.current.on("signal", async ({ from, data }) => {
      // data might be an offer/answer (SDP) or ICE candidate (candidate property)
      try {
        // ensure we have a pc
        if (!pcRef.current) {
          // non-initiator should start the pc if not initiated yet
          await startCall(false);
        }

        if (!data) return;

        if (data.type === "offer") {
          // set remote offer and only non-initiator answers
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(data));
          // create answer
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);

          socketRef.current.emit("signal", {
            roomId: roomRef.current,
            to: from,
            data: pcRef.current.localDescription,
          });
        } else if (data.type === "answer") {
          // remote answered our offer
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(data));
        } else if (data.candidate || data.candidate === "") {
          // ICE candidate message
          try {
            // Normalize candidate object (some libs send candidate object directly)
            const cand = new RTCIceCandidate(data);
            await pcRef.current.addIceCandidate(cand);
          } catch (err) {
            console.warn("addIceCandidate error:", err);
          }
        }
      } catch (err) {
        console.error("Error handling signal:", err);
      }
    });

    socketRef.current.on("chat-message", ({ message }) => {
      setMessages((m) => [...m, { from: "partner", text: message }]);
    });

    socketRef.current.on("partner-skipped", () => {
      cleanupCall();
      setStatus("partner-skipped");
      setTimeout(joinQueue, 1000);
    });

    socketRef.current.on("partner-disconnected", () => {
      cleanupCall();
      setStatus("partner-disconnected");
      setTimeout(joinQueue, 1000);
    });

    return () => {
      try {
        if (socketRef.current) socketRef.current.disconnect();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function getMedia() {
  return await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 }
    },
    audio: true
  });
}


  async function startCall(isInitiator) {
    // If there's already a pc, clean it first to avoid stale states
    if (pcRef.current) {
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
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

    // Forward local ICE candidates to partner
    pcRef.current.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current.emit("signal", {
          roomId: roomRef.current,
          to: partnerRef.current,
          data: e.candidate,
        });
      }
    };

    // set remote stream when arrives
    pcRef.current.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };

    // get and attach local tracks
    const localStream = await getMedia();
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
    localStream.getTracks().forEach((track) => pcRef.current.addTrack(track, localStream));

    // Only the initiator creates and sends the offer
    if (isInitiator) {
      try {
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);

        socketRef.current.emit("signal", {
          roomId: roomRef.current,
          to: partnerRef.current,
          data: pcRef.current.localDescription,
        });
      } catch (err) {
        console.error("Error creating/sending offer:", err);
      }
    }
  }

  function cleanupCall() {
    try {
      if (pcRef.current) pcRef.current.close();
    } catch (e) {}
    pcRef.current = null;

    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;

    roomRef.current = null;
    partnerRef.current = null;
    isInitiatorRef.current = false;
  }

  function joinQueue() {
    setStatus("joining");
    socketRef.current.emit("join");
  }

  function handleSkip() {
    if (!roomRef.current) return;
    socketRef.current.emit("skip", { roomId: roomRef.current });
    cleanupCall();
    setStatus("skipped");
  }

  function handleDisconnect() {
    try { if (socketRef.current) socketRef.current.disconnect(); } catch {}
    cleanupCall();
    setStatus("idle");
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
  <div className="container">

    <div className="status-text">
      Status: <strong>{status}</strong>
    </div>

    {/* Video Section */}
    <div className="glass-card" style={{ marginBottom: 20 }}>
      <h2 style={{ marginBottom: 10 }}>Video Chat</h2>

      <div style={{ display: "flex", gap: 20 }}>
        
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 8 }}>Local</div>
          <div className="video-box">
            <video ref={localVideoRef} autoPlay muted playsInline></video>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 8 }}>Remote</div>
          <div className="video-box">
            <video ref={remoteVideoRef} autoPlay playsInline></video>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
        <button className="btn" onClick={joinQueue}>Join</button>
        <button className="btn" onClick={handleSkip}>Skip</button>
        <button className="btn red" onClick={handleDisconnect}>Disconnect</button>
      </div>
    </div>

    {/* Chat + Notes */}
    <div style={{ display: "flex", gap: 20 }}>

      {/* Chat Panel */}
      <div style={{ flex: 1 }}>
        <h3>Chat</h3>

        <div className="chat-panel">
          {messages.map((m, i) => (
            <div key={i} style={{ textAlign: m.from === "me" ? "right" : "left", marginBottom: 8 }}>
              <small style={{ opacity: 0.7 }}>{m.from}:</small>
              <div>{m.text}</div>
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

      {/* Notes Panel */}
      <div style={{ flex: 0.7 }} className="glass-card">
        <h3>Notes</h3>
        <ul>
          <li>Allow camera & microphone when prompted.</li>
          <li>TURNSERVER improves connection reliability.</li>
          <li>Best on Chrome mobile & desktop.</li>
        </ul>
      </div>
    </div>
  </div>
);

}
