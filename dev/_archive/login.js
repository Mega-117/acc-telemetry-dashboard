// Import auth instance from centralized Firebase configuration
import { auth } from './firebase-auth.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";


//input
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const submitButton = document.getElementById('submit-button');

submitButton.addEventListener('click', (event) => {
    event.preventDefault(); // Prevent form submission
    const email = loginEmail.value;
    const password = loginPassword.value;

    signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            console.log('Login successful:', user.email);
            // Trigger success screen
            if (typeof dashboard !== 'undefined') {
                dashboard.showLoginSuccess();
            }
        })
        .catch((error) => {
            const errorCode = error.code;
            const errorMessage = error.message;
            console.error('Login error:', errorCode, errorMessage);
            alert('Errore login: ' + errorMessage);
        });
});
