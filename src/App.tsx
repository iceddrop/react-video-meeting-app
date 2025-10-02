import React from "react";
import { BrowserRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
import VideoCall from "./pages/VideoCall";

function MeetingPage() {
  const { roomId } = useParams<{ roomId: string }>();
  return (
    <VideoCall roomId={roomId || "default"} userId={Date.now().toString()} />
  );
}

function HomePage() {
  const navigate = useNavigate();

  const startMeeting = () => {
    const newRoomId = Math.random().toString(36).substring(2, 9); // random roomId
    navigate(`/meet/${newRoomId}`);
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>Welcome to My Meet Clone</h1>
      <button onClick={startMeeting}>Start New Meeting</button>
      <p>Or join one using a link like /meet/abc123</p>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/meet/:roomId" element={<MeetingPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
