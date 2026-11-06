import { AuthForm } from "../../features/account/components/AuthForm";
export default function Page() {
  return (
    <main className="auth-layout section-width">
      <div className="auth-story">
        <span className="eyebrow">SENANG MELIHAT ANDA LAGI</span>
        <h1>
          Selamat
          <br />
          <em>datang kembali.</em>
        </h1>
        <p>Masuk dan lanjutkan semua rencana baik Anda.</p>
        <div className="auth-art" aria-hidden="true">
          ✳
        </div>
      </div>
      <div className="auth-card">
        <span className="eyebrow">AKUN RENTAID</span>
        <h2>
          Masuk<span className="accent-dot">.</span>
        </h2>
        <p>Masukkan detail akun Anda untuk melanjutkan.</p>
        <AuthForm mode="login" />
      </div>
    </main>
  );
}
