# R&W Practice — setup

This app runs entirely in your browser. Two free services make it work from any computer:

- **Firebase** (Google): sign-in plus a private database for your questions, progress, and wrong-answer folder.
- **GitHub Pages**: hosts the app files at a web address.

Setup takes about 15 minutes. Nothing needs to be installed.

---

## 1. Create a Firebase project

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. Click **Create a project**. Give it any name, like `rw-practice`. You can turn off Google Analytics.
3. Wait for it to finish, then click **Continue**.

## 2. Turn on Google sign-in

1. In the left sidebar, open **Build → Authentication**, then click **Get started**.
2. Under **Sign-in method**, click **Google**, switch it to **Enable**, choose your email as the support email, and click **Save**.

## 3. Create the database

1. In the left sidebar, open **Build → Firestore Database** and click **Create database**.
2. Pick any location near you, choose **Start in production mode**, and click **Create**.
3. Open the **Rules** tab, replace everything there with the contents of `firestore.rules` from this folder, and click **Publish**.
   These rules make sure only you can read or change your data.

## 4. Connect the app to Firebase

1. Click the gear icon next to **Project Overview** → **Project settings**.
2. Under **Your apps**, click the **</>** (Web) icon. Give it a nickname (anything), leave Hosting unchecked, and click **Register app**.
3. Firebase shows a block of code containing `const firebaseConfig = { ... }`. Copy just the `{ ... }` part.
4. Open `js/firebase-config.js` in this folder in any text editor and replace `null` with what you copied, so it looks like:

   ```js
   window.FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "rw-practice-xxxx.firebaseapp.com",
     projectId: "rw-practice-xxxx",
     storageBucket: "rw-practice-xxxx.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

   These values aren't secret. They only identify your project; the rules from step 3 are what protect your data.

## 5. Put the app online with GitHub Pages

1. Create a free account at <https://github.com> if you don't have one.
2. Click **+** (top right) → **New repository**. Name it `rw-practice`, set it to **Public** (free Pages needs that; only the app code goes here, not your questions), and click **Create repository**.
3. On the new repository page, click **uploading an existing file**. Drag in **everything inside** the `sat-practice-app` folder (`index.html`, `css`, `js`, and the other files), so `index.html` sits at the top level. Click **Commit changes**.
4. Go to **Settings → Pages**. Under **Branch**, choose `main` and `/ (root)`, then click **Save**.
5. After a minute or two, the page shows your address, like `https://YOUR-USERNAME.github.io/rw-practice/`.

## 6. Allow sign-in from your new address

1. Back in Firebase: **Authentication → Settings → Authorized domains → Add domain**.
2. Enter `YOUR-USERNAME.github.io` (no `https://`, no path) and click **Add**.

## 7. First use

1. Open your GitHub Pages address and sign in with Google.
2. Go to **Question Bank** and drop in your Question Bank PDF export. Reading it takes about 10–30 seconds, then it uploads to your account.
3. On your other computer, open the same address and sign in with the same Google account. Everything is already there.

---

## Updating the app later

If you change any files, upload them to the repository again the same way (**Add file → Upload files**). GitHub Pages updates within a minute or two.

## Exporting more questions

Export another PDF from the Question Bank (with answers and explanations included) and drop it into the **Question Bank** tab. Questions are matched by their Question ID, so new ones are added and existing ones keep their progress.

## Free-plan limits

Firebase's free plan allows 50,000 database reads and 20,000 writes per day. A full module uses a few dozen writes. The question bank is downloaded once per computer, then cached in the browser.

## Using it without Firebase

If `js/firebase-config.js` is left as `null`, the app runs in **local mode**: everything works, but data stays in that one browser and doesn't sync.
