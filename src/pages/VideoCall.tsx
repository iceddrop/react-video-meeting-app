import React, { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const socket: Socket = io("https://your-backend-url-here"); // change to your backend

const VideoCall: React.FC<{ roomId: string; userId: string }> = ({ roomId, userId }) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const start = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection({
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
          {
            urls: "turn:openrelay.metered.ca:443?transport=tcp",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
        ],
      });
      pcRef.current = pc;

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      pc.ontrack = event => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      pc.onicecandidate = event => {
        if (event.candidate) {
          socket.emit("candidate", { candidate: event.candidate, roomId, from: userId });
        }
      };

      socket.emit("join-room", { roomId, userId });

      socket.on("user-joined", async (otherUserId: string) => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("signal", { roomId, from: userId, to: otherUserId, signal: offer });
      });

      socket.on("signal", async (data: any) => {
        if (!pc) return;

        if (data.signal.type === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("signal", { roomId, from: userId, to: data.from, signal: answer });
        } else if (data.signal.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
        }
      });

      socket.on("candidate", async (data: any) => {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
          console.error("Error adding candidate", err);
        }
      });

      setConnected(true);
    };

    start();

    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId]);

  const cleanup = () => {
    socket.disconnect();
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    setConnected(false);
    setEnded(true);
  };

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-lg font-bold">Video Call Room: {roomId}</h2>
      <div className="flex gap-4 mt-4">
        <video ref={localVideoRef} autoPlay playsInline muted className="w-64 h-48 bg-black rounded" />
        <video ref={remoteVideoRef} autoPlay playsInline className="w-64 h-48 bg-black rounded" />
      </div>

      {connected && !ended && (
        <button
          onClick={cleanup}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          End Call
        </button>
      )}

      {ended && <p className="mt-4 text-red-500">Call Ended ❌</p>}
    </div>
  );
};

export default VideoCall;
