package id.rentaid.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import id.rentaid.app.navigation.RentaidApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = AppContainer(applicationContext)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    RentaidApp(
                        container.connection,
                        container.accounts,
                        container.catalog,
                        checkout = container.checkout,
                        attempts = container.attempts,
                        orders = container.orders,
                    )
                }
            }
        }
    }
}
