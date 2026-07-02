"use client";

export default function NotificationBell() {
  return (
    <button className="notification-button" type="button" aria-label="Notifications">
      <span aria-hidden="true">3</span>
    </button>
  );
}
