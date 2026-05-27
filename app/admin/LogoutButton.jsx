"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <button
      onClick={logout}
      style={{
        background: "none",
        border: "none",
        color: "var(--text-tertiary)",
        fontSize: 11,
        cursor: "pointer",
        fontFamily: "inherit",
        textDecoration: "underline",
        textUnderlineOffset: 2,
        padding: 0,
      }}
    >
      Sign out
    </button>
  );
}
