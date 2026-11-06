@file:Suppress("ktlint:standard:function-naming")

package id.rentaid.app.core.presentation

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import id.rentaid.app.core.network.loadPublicImage
import java.util.UUID

private data class ImageState(val loading: Boolean = true, val bitmap: ImageBitmap? = null)

@Composable
fun PublicImage(
    baseUrl: String,
    id: UUID,
    description: String,
) {
    val image by produceState(initialValue = ImageState(), baseUrl, id) {
        value = ImageState()
        value = ImageState(loading = false, bitmap = loadPublicImage(baseUrl, id)?.asImageBitmap())
    }
    if (image.loading) {
        Text("Memuat gambar…")
    } else if (image.bitmap != null) {
        Image(
            image.bitmap!!,
            contentDescription = description,
            modifier = Modifier.fillMaxWidth().height(200.dp),
            contentScale = ContentScale.Crop,
        )
    } else {
        Text("Gambar tidak tersedia")
    }
}
