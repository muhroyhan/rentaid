package id.rentaid.app

import id.rentaid.client.apis.DefaultApi
import id.rentaid.client.infrastructure.ClientException
import id.rentaid.client.models.LoginRequest
import id.rentaid.client.models.Profile
import id.rentaid.client.models.ProfileInput
import id.rentaid.client.models.RegistrationInput
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient

interface AccountRepository {
    suspend fun restore(): Profile?

    suspend fun register(
        email: String,
        password: String,
        name: String,
        phone: String,
    )

    suspend fun login(
        email: String,
        password: String,
    ): Profile

    suspend fun update(
        name: String,
        phone: String,
    ): Profile

    suspend fun logout()
}

class SessionExpired : Exception()

class ApiAccountRepository(baseUrl: String, private val store: SessionStore) : AccountRepository {
    @Volatile private var token: String? = null
    private val client =
        OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).addInterceptor { chain ->
            val request = chain.request()
            val session = token
            val authenticated =
                request.url.encodedPath == "/api/v1/profile" ||
                    request.url.encodedPath == "/api/v1/auth/logout"
            chain.proceed(
                if (authenticated && session != null) request.newBuilder().header("Authorization", "Bearer $session").build() else request,
            )
        }.build()
    private val api = DefaultApi(baseUrl, client)

    private fun expired(error: ClientException): Nothing {
        if (error.statusCode == 401) {
            token = null
            store.clear()
            throw SessionExpired()
        }
        throw error
    }

    override suspend fun restore(): Profile? =
        withContext(Dispatchers.IO) {
            token = store.read() ?: return@withContext null
            try {
                api.getProfile()
            } catch (error: ClientException) {
                expired(error)
            }
        }

    override suspend fun register(
        email: String,
        password: String,
        name: String,
        phone: String,
    ) {
        withContext(Dispatchers.IO) {
            api.register(RegistrationInput(email, password, name, phone, RegistrationInput.Client.android))
        }
    }

    override suspend fun login(
        email: String,
        password: String,
    ): Profile =
        withContext(Dispatchers.IO) {
            val session = api.login(LoginRequest(email, password, LoginRequest.Client.android))
            val newToken = requireNotNull(session.token) { "Missing Android session token" }
            token = newToken
            try {
                store.write(newToken)
                api.getProfile()
            } catch (error: Exception) {
                try {
                    api.logout()
                } catch (_: Exception) {
                }
                token = null
                store.clear()
                throw error
            }
        }

    override suspend fun update(
        name: String,
        phone: String,
    ): Profile =
        withContext(Dispatchers.IO) {
            try {
                api.updateProfile(ProfileInput(name, phone))
            } catch (error: ClientException) {
                expired(error)
            }
        }

    override suspend fun logout() {
        withContext(Dispatchers.IO) {
            try {
                api.logout()
            } catch (error: ClientException) {
                expired(error)
            }
            token = null
            store.clear()
        }
    }
}
