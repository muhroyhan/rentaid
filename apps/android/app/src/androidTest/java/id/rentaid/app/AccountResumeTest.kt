package id.rentaid.app

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.compose.LocalLifecycleOwner
import id.rentaid.app.account.data.AccountRepository
import id.rentaid.app.account.data.SessionExpired
import id.rentaid.app.account.presentation.AccountScreen
import id.rentaid.app.account.presentation.AccountViewModel
import id.rentaid.client.models.Profile
import org.junit.Rule
import org.junit.Test
import java.util.UUID

class AccountResumeTest {
    @get:Rule val compose = createComposeRule()

    private class Owner : LifecycleOwner {
        val registry = LifecycleRegistry(this)
        override val lifecycle: Lifecycle get() = registry
    }

    private class Accounts : AccountRepository {
        var expired = false
        val profile = Profile(UUID.randomUUID(), "resume@example.test", "Pengguna", "0812345678", Profile.Status.active)

        override suspend fun restore(): Profile {
            if (expired) throw SessionExpired()
            return profile
        }

        override suspend fun register(
            email: String,
            password: String,
            name: String,
            phone: String,
        ) = Unit

        override suspend fun login(
            email: String,
            password: String,
        ) = profile

        override suspend fun update(
            name: String,
            phone: String,
        ) = profile

        override suspend fun logout() = Unit
    }

    @Test fun returningToAccountChecksRevocation() {
        val owner = Owner()
        val accounts = Accounts()
        lateinit var model: AccountViewModel
        compose.runOnUiThread {
            owner.registry.currentState = Lifecycle.State.CREATED
            model = AccountViewModel(accounts)
        }
        compose.setContent { CompositionLocalProvider(LocalLifecycleOwner provides owner) { AccountScreen(model) {} } }
        compose.runOnUiThread { owner.registry.currentState = Lifecycle.State.RESUMED }
        compose.waitUntil(5000) { compose.onAllNodes(hasText("resume@example.test")).fetchSemanticsNodes().isNotEmpty() }
        compose.runOnUiThread {
            owner.registry.currentState = Lifecycle.State.STARTED
            accounts.expired = true
            owner.registry.currentState = Lifecycle.State.RESUMED
        }
        compose.waitUntil(
            5000,
        ) { compose.onAllNodes(hasText("Sesi tidak berlaku. Silakan masuk kembali.")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Masuk", substring = false).assertIsDisplayed()
        compose.runOnUiThread { owner.registry.currentState = Lifecycle.State.DESTROYED }
    }
}
