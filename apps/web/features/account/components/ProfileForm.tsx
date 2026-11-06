"use client";
import { useProfileForm } from "../application/useProfileForm";

export function ProfileForm({ csrfToken }: { csrfToken: string }) {
  const { profile, setProfile, busy, error, notice, save } = useProfileForm({
    csrfToken,
  });
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
