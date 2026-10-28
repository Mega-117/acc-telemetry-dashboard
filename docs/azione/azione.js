// PIP-672: Racer Core page for the links in the Firebase emails (reset password, verify the email,
// confirm or undo an address change), on app.racercore.app instead of the Firebase default page.
//
// One sentence: read mode and oobCode from the link, apply them with the Identity Toolkit REST API
// and say in plain words what happened and what to do next. No app shell and no login: the link
// opens in any browser. The key is the site's public web key, never the one in the link, so a
// crafted link cannot send a new password to another project.
(function () {
    'use strict';

    var API_KEY = 'AIzaSyCx092q7up_BXFgK2e13A-IQ3uDjwf6J5A';
    var API = 'https://identitytoolkit.googleapis.com/v1/accounts:';

    var TEXT = {
        it: {
            working: 'Un momento…',
            verifiedTitle: 'Email verificata',
            verified: 'Il tuo account è attivo.',
            verifiedNext: 'Torna su Racer Core e premi "Ho confermato l\'email".',
            changedTitle: 'Indirizzo aggiornato',
            changed: 'Da ora accedi con {email}.',
            restoredTitle: 'Indirizzo ripristinato',
            restored: 'L\'account usa di nuovo {email}.',
            restoredNext: 'Se non hai chiesto tu il cambio, reimposta la password dal login di Racer Core.',
            resetTitle: 'Nuova password',
            reset: 'Scegli la nuova password per {email}.',
            password: 'Nuova password',
            confirm: 'Ripeti la password',
            save: 'Salva la password',
            short: 'La password deve avere almeno 6 caratteri.',
            mismatch: 'Le due password non coincidono.',
            doneTitle: 'Password cambiata',
            done: 'Torna su Racer Core e accedi con la nuova password.',
            invalidTitle: 'Link non valido',
            expired: 'Il link è scaduto o è già stato usato.',
            invalid: 'Il link è incompleto o non è più valido.',
            invalidNext: 'Chiedine uno nuovo da Racer Core (login o schermata di verifica).',
            failed: 'Non è stato possibile completare l\'operazione. Controlla la connessione e riprova.',
            disabled: 'Questo account è disattivato.',
        },
        en: {
            working: 'One moment…',
            verifiedTitle: 'Email verified',
            verified: 'Your account is active.',
            verifiedNext: 'Go back to Racer Core and press "I have confirmed my email".',
            changedTitle: 'Address updated',
            changed: 'From now on, log in with {email}.',
            restoredTitle: 'Address restored',
            restored: 'The account uses {email} again.',
            restoredNext: 'If you did not ask for the change, reset your password from the Racer Core login.',
            resetTitle: 'New password',
            reset: 'Choose the new password for {email}.',
            password: 'New password',
            confirm: 'Repeat the password',
            save: 'Save the password',
            short: 'The password needs at least 6 characters.',
            mismatch: 'The two passwords do not match.',
            doneTitle: 'Password changed',
            done: 'Go back to Racer Core and log in with the new password.',
            invalidTitle: 'Invalid link',
            expired: 'The link has expired or was already used.',
            invalid: 'The link is incomplete or no longer valid.',
            invalidNext: 'Ask for a new one from Racer Core (login or verification screen).',
            failed: 'The operation could not be completed. Check the connection and try again.',
            disabled: 'This account is disabled.',
        },
    };

    var params = new URLSearchParams(window.location.search);
    var lang = String(params.get('lang') || navigator.language || 'it').toLowerCase().indexOf('en') === 0 ? 'en' : 'it';
    var t = TEXT[lang];
    var mode = params.get('mode');
    var code = params.get('oobCode') || '';
    document.documentElement.lang = lang;

    function el(id) { return document.getElementById(id); }
    function fill(text, email) { return text.replace('{email}', email || ''); }
    function show(title, message, next) {
        el('title').textContent = title;
        el('message').textContent = message || '';
        el('next').textContent = next || '';
    }

    function call(endpoint, body) {
        return fetch(API + endpoint + '?key=' + API_KEY, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (data) {
                if (response.ok) return data;
                var error = new Error((data && data.error && data.error.message) || 'HTTP_' + response.status);
                throw error;
            });
        });
    }

    function fail(error) {
        var reason = String(error && error.message || '');
        if (/EXPIRED_OOB_CODE|INVALID_OOB_CODE/.test(reason)) show(t.invalidTitle, t.expired, t.invalidNext);
        else if (/USER_DISABLED/.test(reason)) show(t.invalidTitle, t.disabled, '');
        else show(t.invalidTitle, t.failed, '');
    }

    function apply(title, message, next) {
        return call('update', { oobCode: code }).then(function (data) {
            show(title, fill(message, data.email), next);
        }, fail);
    }

    function resetPassword() {
        return call('resetPassword', { oobCode: code }).then(function (data) {
            show(t.resetTitle, fill(t.reset, data.email), '');
            el('label-password').textContent = t.password;
            el('label-confirm').textContent = t.confirm;
            el('submit').textContent = t.save;
            var form = el('reset');
            form.hidden = false;
            form.addEventListener('submit', function (event) {
                event.preventDefault();
                var password = el('password').value, error = el('form-error');
                var problem = password.length < 6 ? t.short : password !== el('confirm').value ? t.mismatch : '';
                error.textContent = problem;
                error.hidden = !problem;
                if (problem) return;
                el('submit').disabled = true;
                call('resetPassword', { oobCode: code, newPassword: password }).then(function () {
                    form.reset();
                    form.hidden = true;
                    show(t.doneTitle, t.done, '');
                }, function (failure) {
                    el('submit').disabled = false;
                    if (/WEAK_PASSWORD/.test(String(failure && failure.message))) {
                        error.textContent = t.short;
                        error.hidden = false;
                    } else {
                        form.hidden = true;
                        fail(failure);
                    }
                });
            });
        }, fail);
    }

    show(t.working, '', '');
    if (!code) show(t.invalidTitle, t.invalid, t.invalidNext);
    else if (mode === 'verifyEmail') apply(t.verifiedTitle, t.verified, t.verifiedNext);
    else if (mode === 'verifyAndChangeEmail') apply(t.changedTitle, t.changed, '');
    else if (mode === 'recoverEmail') apply(t.restoredTitle, t.restored, t.restoredNext);
    else if (mode === 'resetPassword') resetPassword();
    else show(t.invalidTitle, t.invalid, t.invalidNext);
})();
