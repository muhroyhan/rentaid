package auth

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"rentaid.local/api/internal/database"
)

func insertUser(ctx context.Context, db database.Executor, email string, hash string, now time.Time, name string, phone string, outProfile *Profile) error {
	return db.QueryRow(ctx, `INSERT INTO users(email,password_hash,role,status,created_at,name,phone)
        VALUES($1,$2,'user','active',$3,$4,$5) RETURNING id::text,email,name,phone,status`, email, hash, now, name, phone).Scan(&outProfile.ID, &outProfile.Email, &outProfile.Name, &outProfile.Phone, &outProfile.Status)
}

func selectProfile(ctx context.Context, db database.Executor, id string, outProfile *Profile) error {
	return db.QueryRow(ctx, `SELECT id::text,email,name,phone,status FROM users WHERE id=$1 AND role='user'`, id).Scan(&outProfile.ID, &outProfile.Email, &outProfile.Name, &outProfile.Phone, &outProfile.Status)
}

func updateProfile(ctx context.Context, db database.Executor, id string, name string, phone string, outProfile *Profile) error {
	return db.QueryRow(ctx, `UPDATE users SET name=$2,phone=$3 WHERE id=$1 AND role='user' RETURNING id::text,email,name,phone,status`, id, name, phone).Scan(&outProfile.ID, &outProfile.Email, &outProfile.Name, &outProfile.Phone, &outProfile.Status)
}

func insertAdmin(ctx context.Context, db database.Executor, email string, hash string, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `INSERT INTO users(email,password_hash,role,status,created_at)
        VALUES($1,$2,'admin','active',$3) ON CONFLICT(email) DO NOTHING`, email, hash, now)
}

func selectAccountRole(ctx context.Context, db database.Executor, email string, outRole *string) error {
	return db.QueryRow(ctx, "SELECT role FROM users WHERE email=$1", email).Scan(outRole)
}

func selectLoginUser(ctx context.Context, db database.Executor, email string, outUser *User, outHash *string, outStatus *string) error {
	return db.QueryRow(ctx, "SELECT id::text,email,password_hash,role,status FROM users WHERE email=$1 FOR UPDATE", email).Scan(&outUser.ID, &outUser.Email, outHash, &outUser.Role, outStatus)
}

func insertSession(ctx context.Context, db database.Executor, id string, tokenHash []byte, csrf string, now time.Time, expiry time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `INSERT INTO sessions(user_id,token_hash,csrf_token,created_at,expires_at)
        VALUES($1,$2,$3,$4,$5)`, id, tokenHash, csrf, now, expiry)
}

func selectSession(ctx context.Context, db database.Executor, hash []byte, now time.Time, outSession *Session) error {
	return db.QueryRow(ctx, `SELECT u.id::text,u.email,u.role,s.csrf_token,s.expires_at
        FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.token_hash=$1 AND s.expires_at>$2 AND u.status='active'`, hash, now).Scan(&outSession.User.ID, &outSession.User.Email, &outSession.User.Role, &outSession.CSRFToken, &outSession.ExpiresAt)
}

func deleteSession(ctx context.Context, db database.Executor, hash []byte) (pgconn.CommandTag, error) {
	return db.Exec(ctx, "DELETE FROM sessions WHERE token_hash=$1", hash)
}

func deleteUserSessions(ctx context.Context, db database.Executor, userID string) (pgconn.CommandTag, error) {
	return db.Exec(ctx, "DELETE FROM sessions WHERE user_id=$1", userID)
}

func listUsers(ctx context.Context, db database.Executor, size int, now int) (pgx.Rows, error) {
	return db.Query(ctx, `SELECT id::text,email,name,phone,status FROM users WHERE role='user' ORDER BY created_at DESC,id DESC LIMIT $1 OFFSET $2`, size, now)
}

func setUserStatus(ctx context.Context, db database.Executor, id string, status string, outProfile *Profile) error {
	return db.QueryRow(ctx, `UPDATE users SET status=$2 WHERE id=$1 AND role='user' RETURNING id::text,email,name,phone,status`, id, status).Scan(&outProfile.ID, &outProfile.Email, &outProfile.Name, &outProfile.Phone, &outProfile.Status)
}

func revokeUserSessions(ctx context.Context, db database.Executor, id string) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `DELETE FROM sessions WHERE user_id=$1`, id)
}
