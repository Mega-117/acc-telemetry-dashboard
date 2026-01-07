// Import auth instance from centralized Firebase configuration
import { auth } from './firebase-auth.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";


//input
const registerEmail = document.getElementById('registerEmail');
const registerPassword = document.getElementById('registerPassword');
const registerPasswordConfirm = document.getElementById('registerPasswordConfirm');
const registerButton = document.getElementById('register-button');


registerButton.addEventListener('click', (event) => {
    event.preventDefault(); // Prevent form submission
    const email = registerEmail.value;
    const password = registerPassword.value;
    const confirmPassword = registerPasswordConfirm.value;
    const name = document.getElementById('registerName')?.value;

    // Validazione password
    if (password !== confirmPassword) {
        alert('Le password non coincidono');
        return;
    }

    if (password.length < 6) {
        alert('La password deve essere almeno 6 caratteri');
        return;
    }

    createUserWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            console.log('Registration successful:', user.email);

            // Mostra schermata successo
            if (typeof dashboard !== 'undefined') {
                dashboard.showSuccessScreen(`Benvenuto, ${name || email.split('@')[0]}!`);
            } else {
                alert('Registrazione avvenuta con successo!');
            }
        })
        .catch((error) => {
            const errorCode = error.code;
            const errorMessage = error.message;
            console.error('Registration error:', errorCode, errorMessage);

            // Messaggi utente-friendly
            let userMessage = 'Errore durante la registrazione: ';
            if (errorCode === 'auth/email-already-in-use') {
                userMessage = 'Questa email è già registrata. Prova ad accedere.';
            } else if (errorCode === 'auth/invalid-email') {
                userMessage = 'Email non valida.';
            } else if (errorCode === 'auth/weak-password') {
                userMessage = 'Password troppo debole. Usa almeno 6 caratteri.';
            } else {
                userMessage += errorMessage;
            }

            alert(userMessage);
        });
});
