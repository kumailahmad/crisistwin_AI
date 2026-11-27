package pk.crisistwin.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val CrisisMarineBg = Color(0xFF050B17)
private val CrisisMarineSurface = Color(0xFF0B1424)
private val CrisisMarineSurfaceVariant = Color(0xFF132238)
private val CrisisCyan = Color(0xFF21C7D9)
private val CrisisAmber = Color(0xFFE9A23B)
private val CrisisRed = Color(0xFFDC454D)
private val CrisisText = Color(0xFFEDF5FA)
private val CrisisMuted = Color(0xFF94A3B8)
private val CrisisBorder = Color(0xFF1E324F)

private val CrisisColorScheme = darkColorScheme(
    primary = CrisisCyan,
    onPrimary = CrisisMarineBg,
    secondary = CrisisAmber,
    onSecondary = CrisisMarineBg,
    error = CrisisRed,
    onError = Color.White,
    background = CrisisMarineBg,
    onBackground = CrisisText,
    surface = CrisisMarineSurface,
    onSurface = CrisisText,
    surfaceVariant = CrisisMarineSurfaceVariant,
    onSurfaceVariant = CrisisMuted,
    outline = CrisisBorder,
)

private val CrisisTypography = Typography(
    headlineSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 22.sp,
        lineHeight = 28.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
)

private val CrisisShapes = Shapes(
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(20.dp),
)

@Composable
fun CrisisTwinTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = CrisisColorScheme,
        typography = CrisisTypography,
        shapes = CrisisShapes,
        content = content,
    )
}
