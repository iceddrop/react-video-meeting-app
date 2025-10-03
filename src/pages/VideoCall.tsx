import React, { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

interface SignalData {
  userId: string;
  roomId: string;
  signal: any;
}

interface VideoCallProps {
  roomId: string;
  userId: string;
}

const socket: Socket = io("https://nest-webrtc-signaling-server.onrender.com"); // Your NestJS backend URL

const VideoCall: React.FC<VideoCallProps> = ({ roomId, userId }) => {
  const [remoteStreams, setRemoteStreams] = useState<MediaStream[]>([]);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    async function initMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localStreamRef.current = stream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Join the room
        socket.emit("join-room", { roomId, userId });

        // When a new user joins
        socket.on("user-joined", (newUserId: string) => {
          console.log("New user joined:", newUserId);
          createPeerConnection(newUserId, stream, true);
        });

        socket.on("candidate", async (data) => {
          if (data.to === userId) {
            const peer = peersRef.current[data.from];
            if (peer) {
              try {
                await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch (err) {
                console.error("Error adding received ice candidate", err);
              }
            }
          }
        });

        // Handle signaling messages
        socket.on("signal", (data: SignalData) => {
          if (data.userId === userId) return; // ignore self
          handleSignal(data, stream);
        });

        // Handle when a user leaves
        socket.on("user-left", (leftUserId: string) => {
          console.log("User left:", leftUserId);
          if (peersRef.current[leftUserId]) {
            peersRef.current[leftUserId].close();
            delete peersRef.current[leftUserId];
          }
          // Remove their stream from state
          setRemoteStreams((prev) =>
            prev.filter((s) => s.id !== leftUserId)
          );
        });
      } catch (err) {
        console.error("Error accessing media devices:", err);
      }
    }

    initMedia();

    return () => {
      endCall();
    };
  }, [roomId, userId]);

// Create Peer Connection
const createPeerConnection = (
  otherUserId: string,
  stream: MediaStream,
  initiator: boolean
) => {
  const peer = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" }
    ]
  });

  // Add local tracks
  stream.getTracks().forEach((track) => peer.addTrack(track, stream));

  // Remote stream
  peer.ontrack = (event) => {
    setRemoteStreams((prev) => {
      if (!prev.find((s) => s.id === event.streams[0].id)) {
        return [...prev, event.streams[0]];
      }
      return prev;
    });
  };

  // ICE candidates
  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("candidate", {
        roomId,
        userId,
        candidate: event.candidate,
        to: otherUserId, // <--- specify target
      });
    }
  };

  peersRef.current[otherUserId] = peer;

  // If initiator, create offer
  if (initiator) {
    peer.createOffer().then((offer) => {
      peer.setLocalDescription(offer);
      socket.emit("signal", {
        roomId,
        userId,
        signal: { sdp: offer },
        to: otherUserId, // <--- specify target
      });
    });
  }
};


  // Handle incoming signal
const handleSignal = async (data: SignalData, stream: MediaStream) => {
  const { userId: fromUser, signal } = data;

  let peer = peersRef.current[fromUser];
  if (!peer) {
    peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    peersRef.current[fromUser] = peer;

    // Add local stream
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    // Handle remote
    peer.ontrack = (event) => {
      setRemoteStreams((prev) => [...prev, event.streams[0]]);
    };

    // ICE
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("candidate", {
          roomId,
          userId,
          candidate: event.candidate,
          to: fromUser,
        });
      }
    };
  }

  // Handle SDP
  if (signal.sdp) {
    await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    if (signal.sdp.type === "offer") {
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit("signal", {
        roomId,
        userId,
        signal: { sdp: answer },
        to: fromUser,
      });
    }
  } else if (signal.candidate) {
    await peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
  }
};


  // ✅ End Call
  const endCall = () => {
    console.log("Ending call...");

    // Stop local media tracks
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    // Close all peer connections
    Object.values(peersRef.current).forEach((peer) => peer.close());
    peersRef.current = {};

    // Notify backend
    socket.emit("leave-room", { roomId, userId });

    // Disconnect socket
    socket.disconnect();

    // Clear UI
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setRemoteStreams([]);
  };

  return (
    <div>
      <h2>Room: {roomId}</h2>
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "300px", border: "1px solid gray" }}
      />
      {remoteStreams.map((stream, index) => (
        <video
          key={index}
          autoPlay
          playsInline
          style={{ width: "300px", border: "1px solid blue" }}
          ref={(el) => {
            if (el && !el.srcObject) el.srcObject = stream;
          }}
        />
      ))}

      <div style={{ marginTop: "20px" }}>
        <button onClick={endCall} style={{ padding: "10px 20px" }}>
          End Call
        </button>
      </div>
    </div>
  );
};

export default VideoCall;
