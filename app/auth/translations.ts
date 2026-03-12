export function getAuthTranslations(language: 'en' | 'es') {
  return {
    tagline: language === 'es' ? 'Nunca Entrenes Solo' : 'Never Train Alone',
    welcomeBack: language === 'es' ? '¡Bienvenido de nuevo!' : 'Welcome back!',
    joinCommunity: language === 'es' ? 'Únete a la comunidad' : 'Join the community',
    name: language === 'es' ? 'Nombre' : 'Name',
    namePlaceholder: language === 'es' ? 'Tu nombre' : 'Your name',
    birthDate: language === 'es' ? 'Fecha de Nacimiento' : 'Date of Birth',
    mustBe18:
      language === 'es' ? '❌ Debes tener 18 años o más para usar Tribe' : '❌ You must be 18 or older to use Tribe',
    enterBirthDate:
      language === 'es' ? '❌ Por favor ingresa tu fecha de nacimiento' : '❌ Please enter your date of birth',
    mustBe18Note: language === 'es' ? 'Debes tener 18 años o más' : 'You must be 18 or older',
    tosLabel: language === 'es' ? 'Acepto los' : 'I accept the',
    termsOfService: language === 'es' ? 'Términos de Servicio' : 'Terms of Service',
    andThe: language === 'es' ? 'y la' : 'and the',
    privacyPolicy: language === 'es' ? 'Política de Privacidad' : 'Privacy Policy',
    mustAcceptTos:
      language === 'es' ? '❌ Debes aceptar los Términos de Servicio' : '❌ You must accept the Terms of Service',
    email: language === 'es' ? 'Correo Electrónico' : 'Email',
    password: language === 'es' ? 'Contraseña' : 'Password',
    signIn: language === 'es' ? 'Iniciar Sesión' : 'Sign In',
    signUp: language === 'es' ? 'Registrarse' : 'Sign Up',
    loading: language === 'es' ? 'Cargando...' : 'Loading...',
    noAccount: language === 'es' ? '¿No tienes cuenta? Regístrate' : "Don't have an account? Sign up",
    hasAccount: language === 'es' ? '¿Ya tienes cuenta? Inicia sesión' : 'Already have an account? Sign in',
    forgotPassword: language === 'es' ? '¿Olvidaste tu contraseña?' : 'Forgot password?',
    resetEmailSent:
      language === 'es'
        ? '✅ Si existe una cuenta con este correo, recibirás un enlace para restablecer tu contraseña.'
        : "✅ If an account exists with this email, you'll receive a password reset link shortly.",
    enterEmailFirst:
      language === 'es' ? '❌ Ingresa tu correo electrónico primero' : '❌ Please enter your email first',
    backHome: language === 'es' ? '← Volver al inicio' : '← Back to home',
    verifyEmail:
      language === 'es'
        ? '⚠️ Por favor verifica tu correo antes de iniciar sesión.'
        : '⚠️ Please verify your email before logging in. Check your inbox.',
    checkEmail:
      language === 'es'
        ? '✅ ¡Revisa tu correo para verificar tu cuenta!'
        : '✅ Check your email to verify your account!',
    invalidEmail: language === 'es' ? '❌ Por favor ingresa un correo válido' : '❌ Please enter a valid email address',
    resetPassword: language === 'es' ? 'Restablecer Contraseña' : 'Reset Password',
    newPassword: language === 'es' ? 'Nueva Contraseña' : 'New Password',
    confirmPassword: language === 'es' ? 'Confirmar Contraseña' : 'Confirm Password',
    passwordsNoMatch: language === 'es' ? '❌ Las contraseñas no coinciden' : '❌ Passwords do not match',
    passwordUpdated:
      language === 'es' ? '✅ ¡Contraseña actualizada exitosamente!' : '✅ Password updated successfully!',
    updatePassword: language === 'es' ? 'Actualizar Contraseña' : 'Update Password',
    continueWithApple: language === 'es' ? 'Continuar con Apple' : 'Continue with Apple',
    or: language === 'es' ? 'o' : 'or',
    appleSignInError: language === 'es' ? '❌ Error al iniciar sesión con Apple' : '❌ Failed to sign in with Apple',
    continueWithGoogle: language === 'es' ? 'Continuar con Google' : 'Continue with Google',
    googleSignInError: language === 'es' ? '❌ Error al iniciar sesión con Google' : '❌ Failed to sign in with Google',
    resendVerification: language === 'es' ? 'Reenviar correo de verificación' : 'Resend verification email',
    verificationSent: language === 'es' ? '✅ ¡Correo de verificación enviado!' : '✅ Verification email sent!',
    resendIn: language === 'es' ? 'Reenviar en' : 'Resend in',
  };
}

export type AuthTranslations = ReturnType<typeof getAuthTranslations>;
