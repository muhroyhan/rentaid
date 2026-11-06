package id.rentaid.app.core.network

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.ByteArrayOutputStream
import java.util.UUID

private val imageClient = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).build()
private const val MAX_IMAGE_BYTES = 5 * 1024 * 1024

internal suspend fun loadPublicImage(
    baseUrl: String,
    id: UUID,
): Bitmap? =
    withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder().url("${baseUrl.trimEnd('/')}/api/v1/media/$id").build()
            imageClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val body = response.body ?: return@withContext null
                if (body.contentLength() > MAX_IMAGE_BYTES) return@withContext null
                val bytes = ByteArrayOutputStream()
                body.byteStream().use { input ->
                    val buffer = ByteArray(8192)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        if (bytes.size() + count > MAX_IMAGE_BYTES) return@withContext null
                        bytes.write(buffer, 0, count)
                    }
                }
                val data = bytes.toByteArray()
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@withContext null
                var sample = 1
                while (bounds.outWidth / sample > 1024 || bounds.outHeight / sample > 1024) sample *= 2
                BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample })
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            null
        }
    }
