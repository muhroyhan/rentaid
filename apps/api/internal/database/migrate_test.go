//go:build !integration

package database

import (
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestMigrationChecksumLineEndings(t *testing.T) {
	lf := []byte("CREATE TABLE x (id uuid);\nSELECT 1;\n")
	crlf := []byte("CREATE TABLE x (id uuid);\r\nSELECT 1;\r\n")
	sum := sha256.Sum256(crlf)
	if !matchesChecksum(lf, hex.EncodeToString(sum[:])) {
		t.Fatal("CRLF checksum was not accepted for identical LF SQL")
	}
	sum = sha256.Sum256(lf)
	if !matchesChecksum(crlf, hex.EncodeToString(sum[:])) {
		t.Fatal("LF checksum was not accepted for identical CRLF SQL")
	}
	mixed := []byte("CREATE TABLE x (id uuid);\nSELECT 1;\r\n")
	sum = sha256.Sum256(mixed)
	if !matchesChecksum(lf, hex.EncodeToString(sum[:])) {
		t.Fatal("PowerShell line ending was not accepted")
	}
	if matchesChecksum([]byte("DROP TABLE x;\n"), hex.EncodeToString(sum[:])) {
		t.Fatal("changed SQL was accepted")
	}
}
