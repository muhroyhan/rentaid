package id.rentaid.app

import id.rentaid.client.apis.DefaultApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

interface ConnectionRepository {
    suspend fun check(): String
}

class ApiConnectionRepository(private val api: DefaultApi) : ConnectionRepository {
    override suspend fun check(): String =
        withContext(Dispatchers.IO) {
            api.getHealth().status.value
        }
}
