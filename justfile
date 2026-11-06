# Herdhand tasks. Run `just` to list them.

# EAS reads the project id and owner from .env (see .env.example).
set dotenv-load

# List the recipes.
default:
    @just --list

# Install the npm packages.
install:
    npm install

# Typecheck, lint and test: run before every commit.
check:
    npm run check

# Run the tests. Pass a path or pattern to run fewer, for example `just test src/rpc`.
test *args:
    npx jest {{args}}

# Start the dev server for the development build on the phone.
dev:
    npx expo start --dev-client

# Create the EAS project for your Expo account; put the id it prints in .env.
eas-init:
    npx eas-cli@latest init

# Build the development client on EAS. Only needed when native code or native packages change.
build-dev:
    npx eas-cli@latest build --profile development --platform android

# Build a signed app bundle (.aab) for Google Play on EAS.
build-release:
    npx eas-cli@latest build --profile production --platform android
