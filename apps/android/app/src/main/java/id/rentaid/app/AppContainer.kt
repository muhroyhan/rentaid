package id.rentaid.app

import android.content.Context
import id.rentaid.app.account.data.AccountRepository
import id.rentaid.app.account.data.ApiAccountRepository
import id.rentaid.app.catalog.data.ApiCatalogRepository
import id.rentaid.app.catalog.data.CatalogRepository
import id.rentaid.app.checkout.data.ApiCheckoutGateway
import id.rentaid.app.checkout.data.CheckoutAttemptStore
import id.rentaid.app.checkout.data.CheckoutGateway
import id.rentaid.app.checkout.data.EncryptedCheckoutAttemptStore
import id.rentaid.app.connection.data.ApiConnectionRepository
import id.rentaid.app.connection.data.ConnectionRepository
import id.rentaid.app.core.security.KeystoreSessionStore
import id.rentaid.app.orders.data.ApiOrderRepository
import id.rentaid.app.orders.data.OrderRepository
import id.rentaid.client.apis.DefaultApi

class AppContainer(context: Context) {
    private val sessions = KeystoreSessionStore(context)
    val connection: ConnectionRepository = ApiConnectionRepository(DefaultApi(BuildConfig.API_BASE_URL))
    val accounts: AccountRepository = ApiAccountRepository(BuildConfig.API_BASE_URL, sessions)
    val catalog: CatalogRepository = ApiCatalogRepository(DefaultApi(BuildConfig.API_BASE_URL))
    val checkout: CheckoutGateway = ApiCheckoutGateway(BuildConfig.API_BASE_URL, sessions)
    val attempts: CheckoutAttemptStore =
        EncryptedCheckoutAttemptStore(KeystoreSessionStore(context, "checkout_pending", clearOnInvalid = false))
    val orders: OrderRepository = ApiOrderRepository(BuildConfig.API_BASE_URL, sessions)
}
