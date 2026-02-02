import React from "react";

export default function HeaderBar({ user, onLogout }) {
  return (
    <header className="header">
      <div>
        <h1>Smart Home Agent Dashboard</h1>
        <span className="header-sub">Simulator + LLM Control</span>
      </div>

      <div className="header-controls">
        {user && <span className="user-greeting">Hi, {user.username}</span>}
        <button onClick={onLogout} className="logout-btn">
          Logout
        </button>
      </div>
    </header>
  );
}
