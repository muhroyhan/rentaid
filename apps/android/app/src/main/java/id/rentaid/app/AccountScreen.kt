@file:Suppress("ktlint:standard:function-naming")

package id.rentaid.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun AccountScreen(
    model: AccountViewModel,
    onBack: () -> Unit,
) {
    val state by model.state.collectAsStateWithLifecycle()
    var registering by rememberSaveable { mutableStateOf(false) }
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var name by rememberSaveable(state.profile?.id) { mutableStateOf(state.profile?.name.orEmpty()) }
    var phone by rememberSaveable(state.profile?.id) { mutableStateOf(state.profile?.phone.orEmpty()) }

    Column(Modifier.verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(if (state.profile == null) "Akun Rentaid" else "Profil", style = MaterialTheme.typography.headlineMedium)
        state.message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (state.loading) {
            CircularProgressIndicator()
            Text("Mohon tunggu…")
        } else if (state.restoreFailed) {
            Button(onClick = model::restore) { Text("Coba lagi") }
        } else if (state.profile != null) {
            Text(state.profile!!.email)
            OutlinedTextField(name, { name = it }, label = { Text("Nama") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(phone, {
                phone = it
            }, label = {
                Text("Nomor telepon")
            }, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
            Button(onClick = { model.update(name, phone) }) { Text("Simpan profil") }
            Button(onClick = model::logout) { Text("Keluar") }
        } else {
            if (registering && !state.registrationComplete) {
                OutlinedTextField(name, { name = it }, label = { Text("Nama") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(phone, {
                    phone = it
                }, label = {
                    Text("Nomor telepon")
                }, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
            }
            OutlinedTextField(email, {
                email = it
            }, label = {
                Text("Email")
            }, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), singleLine = true)
            OutlinedTextField(
                password,
                {
                    password = it
                },
                label = {
                    Text("Kata sandi")
                },
                modifier = Modifier.fillMaxWidth(),
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions =
                    KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                    ),
                singleLine = true,
            )
            if (registering && !state.registrationComplete) {
                Button(onClick = {
                    model.register(email, password, name, phone)
                    password = ""
                }) { Text("Daftar") }
            } else {
                Button(onClick = {
                    model.login(email, password)
                    password = ""
                }) { Text("Masuk") }
            }
            Button(onClick = {
                registering = if (state.registrationComplete) true else !registering
                password = ""
                model.clearMessage()
            }) {
                Text(if (registering && !state.registrationComplete) "Sudah punya akun? Masuk" else "Buat akun")
            }
        }
        Button(onClick = onBack) { Text("Kembali") }
    }
}
