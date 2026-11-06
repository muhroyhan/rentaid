import { useEffect, useState, type FormEvent } from "react";
import {
  getProfileRequest,
  updateProfileRequest,
} from "../data/profileFormApi";
import { Profile } from "../ProfileForm.model";
export function useProfileForm({ csrfToken }: { csrfToken: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await getProfileRequest();
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
      const result = await updateProfileRequest({
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
  return { profile, setProfile, busy, error, notice, save };
}
