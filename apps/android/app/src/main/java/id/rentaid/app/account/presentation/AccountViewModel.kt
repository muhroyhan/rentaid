package id.rentaid.app.account.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import id.rentaid.app.account.data.AccountRepository
import id.rentaid.app.account.data.SessionExpired
import id.rentaid.client.infrastructure.ClientException
import id.rentaid.client.models.Profile
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AccountState(
    val loading: Boolean = true,
    val profile: Profile? = null,
    val message: String? = null,
    val registrationComplete: Boolean = false,
    val restoreFailed: Boolean = false,
)

class AccountViewModel(private val repository: AccountRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(AccountState())
    val state = mutableState.asStateFlow()

    init {
        restore()
    }

    fun restore() = execute(restoring = true) { copy(profile = repository.restore(), registrationComplete = false) }

    fun refresh() {
        if (!mutableState.value.loading) restore()
    }

    fun register(
        email: String,
        password: String,
        name: String,
        phone: String,
    ) = execute {
        repository.register(email, password, name, phone)
        copy(registrationComplete = true, message = "Pendaftaran berhasil. Silakan masuk.")
    }

    fun login(
        email: String,
        password: String,
    ) = execute {
        copy(profile = repository.login(email, password), registrationComplete = false)
    }

    fun update(
        name: String,
        phone: String,
    ) = execute {
        copy(profile = repository.update(name, phone), message = "Profil berhasil disimpan.")
    }

    fun logout() =
        execute {
            repository.logout()
            copy(profile = null, message = "Anda telah keluar.")
        }

    fun clearMessage() {
        mutableState.value = mutableState.value.copy(message = null, registrationComplete = false)
    }

    private fun execute(
        restoring: Boolean = false,
        operation: suspend AccountState.() -> AccountState,
    ) {
        if (mutableState.value.loading && !restoring) return
        mutableState.value = mutableState.value.copy(loading = true, message = null, restoreFailed = false)
        viewModelScope.launch {
            mutableState.value =
                try {
                    mutableState.value.operation().copy(loading = false)
                } catch (error: CancellationException) {
                    throw error
                } catch (error: SessionExpired) {
                    AccountState(loading = false, message = "Sesi tidak berlaku. Silakan masuk kembali.")
                } catch (error: Exception) {
                    val message =
                        when (error) {
                            is ClientException ->
                                when (error.statusCode) {
                                    400 -> "Data tidak valid. Periksa kembali isian Anda."
                                    401 -> "Email atau kata sandi tidak benar."
                                    403 -> "Akun tidak dapat masuk melalui aplikasi ini."
                                    409 -> "Email sudah terdaftar."
                                    429 -> "Terlalu banyak percobaan. Coba lagi nanti."
                                    else -> "Permintaan tidak dapat diproses. Coba lagi."
                                }
                            else -> "Layanan tidak dapat dihubungi. Periksa koneksi dan coba lagi."
                        }
                    mutableState.value.copy(loading = false, message = message, restoreFailed = restoring)
                }
        }
    }

    class Factory(private val repository: AccountRepository) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(AccountViewModel::class.java))
            return AccountViewModel(repository) as T
        }
    }
}
