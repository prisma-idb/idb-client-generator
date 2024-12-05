# Contributing to Prisma IndexedDB Client Generator

Thank you for considering contributing to the Prisma IndexedDB Client Generator! We welcome all contributions, whether they're bug fixes, feature additions, documentation improvements, or examples.

## How to Contribute

### 1. Fork the Repository
Start by forking the repository to your own GitHub account. Clone the forked repository to your local machine:

```bash
git clone https://github.com/prisma-idb/idb-client-generator
cd idb-client-generator
```

### 2. Install Dependencies
Ensure you have Node.js (>= 20.0.0) installed. Install project dependencies:

```bash
npm install
```

### 3. Create a Branch
Create a branch for your changes:

```bash
git checkout -b your-branch-name
```

Use a descriptive name for your branch, e.g., `fix-typo-in-readme` or `add-new-feature`.

### 4. Make Your Changes
1. Make the changes in the generator package, and then build
    ```bash
    npm run build --workspace=packages/generator
    ```

2. Regenerate the client and play around with queries on the dev server
    ```bash
    cd packages/usage
    npx prisma generate
    npm run dev
    ```

3. Run tests to make sure everything is working
    ```bash
    npm run test
    ```

Edit the code, documentation, or tests as needed. Follow the existing coding style and conventions. Be sure to:

- Run tests (`npm run test`) to ensure your changes don’t break anything.
- Add or update tests to cover your changes.
- Prettify the code by running:

```bash
npm run format
```

### 5. Commit Your Changes
Commit your changes with a clear and concise message:

```bash
git add .
git commit -m "Your descriptive commit message"
```

### 6. Push to Your Fork
Push the changes to your forked repository:

```bash
git push origin your-branch-name
```

### 7. Create a Pull Request
Go to the original repository and open a pull request from your branch. Clearly describe:

- What the change does.
- Why the change is needed.
- Any additional context or details.

### 8. Respond to Feedback
Maintain an open line of communication. Address any comments or requested changes promptly.

## Code of Conduct
Please adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful and considerate in all interactions.

## Local Development

- **Tests:** Run the test suite to verify functionality:
  ```bash
  npm run test
  ```
- **Formatting:** Ensure code formatting matches the project style:
  ```bash
  npm run format
  ```

## Issues and Feature Requests
Feel free to open an issue to report bugs or suggest features. Please include as much detail as possible to help us address your concern.

---

Thank you for contributing! 🎉
