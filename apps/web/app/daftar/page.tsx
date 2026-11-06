import { AuthForm } from "../../features/account/components/AuthForm";
export default function Page() {
  return (
    <main className="auth-layout section-width">
      <div className="auth-story">
        <span className="eyebrow">MARI MULAI BERSAMA</span>
        <h1>
          Rencana baru
          <br />
          <em>dimulai di sini.</em>
        </h1>
        <p>Lebih mudah untuk menyewa, lebih banyak kesempatan untuk berbagi.</p>
        <div className="auth-art" aria-hidden="true">
          ✳
        </div>
      </div>
      <div className="auth-card">
        <span className="eyebrow">AKUN RENTAID</span>
        <h2>
          Buat akun<span className="accent-dot">.</span>
        </h2>
        <p>Isi beberapa detail untuk memulai perjalanan Anda.</p>
        <AuthForm mode="register" />
      </div>
    </main>
  );
}
