"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { components } from "@rentaid/api-client";
import { api } from "../lib/api";
type Profile = components["schemas"]["Profile"];
export function ProfileForm({ csrfToken }: { csrfToken: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await api.GET("/api/v1/profile");
        if (!active) return;
        if (result.response.status === 401) {
          window.location.assign("/masuk");
          return;
        }
        if (!result.data) throw new Error();
        setProfile(result.data);
      } catch {
        if (active) setError("Profil tidak dapat dimuat.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.PUT("/api/v1/profile", {
        headers: { "X-CSRF-Token": csrfToken },
        body: { name: profile.name, phone: profile.phone },
      });
      if (result.response.status === 401) {
        window.location.assign("/masuk");
        return;
      }
      if (!result.data)
        throw new Error(
          result.error?.message ?? "Profil tidak dapat disimpan.",
        );
      setProfile(result.data);
      setNotice("Profil berhasil disimpan.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Profil tidak dapat disimpan.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {profile ? (
        <form className="stack-form" onSubmit={(e) => void save(e)}>
          <label htmlFor="profile-email">Email</label>
          <input id="profile-email" value={profile.email} disabled />
          <label htmlFor="profile-name">Nama lengkap</label>
          <input
            id="profile-name"
            required
            maxLength={120}
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          />
          <label htmlFor="profile-phone">Nomor telepon</label>
          <input
            id="profile-phone"
            type="tel"
            maxLength={40}
            value={profile.phone}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
          />
          <p className="field-hint">Nomor telepon diperlukan saat checkout.</p>
          <button className="button button-dark" type="submit" disabled={busy}>
            {busy ? "Menyimpan..." : "Simpan profil"}
            <span>↗</span>
          </button>
        </form>
      ) : (
        !error && <p>Memuat profil...</p>
      )}
    </>
  );
}
