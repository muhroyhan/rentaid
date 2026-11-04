package id.rentaid.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface ConnectionState {
    data object Loading : ConnectionState

    data class Connected(val status: String) : ConnectionState

    data object Unavailable : ConnectionState
}

class ConnectionViewModel(private val repository: ConnectionRepository) : ViewModel() {
    private val mutableState = MutableStateFlow<ConnectionState>(ConnectionState.Loading)
    val state = mutableState.asStateFlow()
    private var started = false

    init {
        refresh()
    }

    fun refresh() {
        if (mutableState.value == ConnectionState.Loading && started) return
        started = true
        mutableState.value = ConnectionState.Loading
        viewModelScope.launch {
            mutableState.value =
                try {
                    ConnectionState.Connected(repository.check())
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    ConnectionState.Unavailable
                }
        }
    }

    class Factory(private val repository: ConnectionRepository) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(ConnectionViewModel::class.java))
            return ConnectionViewModel(repository) as T
        }
    }
}
