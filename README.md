# LoanFlow

## An AI-Assisted Decision Support System for SME Loan Evaluation and Recommendation

**Cardiff Metropolitan University**  
Cardiff School of Technology  
BSc Software Engineering

Submitted in March 2026

**By**  
Chamidu Dhilshan Kodithuwakkuarachchi  
Student ID: KD/BSCSD/20/53  
Cardiff ID: st20288818

This repository accompanies a dissertation submitted in partial fulfillment of the requirements for the degree of Bachelor of Science in Software Engineering (BSc SE).

## Project Overview

LoanFlow is a final-year university project that explores how artificial intelligence can support small and medium-sized enterprise (SME) loan evaluation and recommendation. The system is designed to help SMEs understand available lending options, assess their eligibility, estimate affordability, prepare required documentation, and track the progress of loan applications through a single digital platform.

The project is focused on the Sri Lankan SME lending context and combines rule-based checks, machine learning, document analysis, and AI-assisted interaction to support better and more transparent lending decisions.

## Academic Context

This repository contains the software artefact developed for the dissertation titled **"LoanFlow: An AI-Assisted Decision Support System for SME Loan Evaluation and Recommendation."** The work was produced as part of the BSc Software Engineering programme at Cardiff Metropolitan University.

The purpose of the project is to investigate whether an AI-assisted decision support system can:

- reduce information gaps in SME lending
- improve the quality of loan-product matching
- support document readiness and verification
- provide more transparent recommendation outputs
- improve the overall user experience for SME applicants and administrators

## Problem Statement

SME loan application processes are often time-consuming, document-heavy, and difficult for applicants to navigate. Borrowers may struggle to compare products across banks, understand eligibility rules, estimate repayments, or know which documents are required before applying.

LoanFlow addresses this problem by providing a unified platform that supports:

- SME profile and application capture
- lender and product comparison
- eligibility and recommendation analysis
- document upload and AI-assisted verification
- application progress tracking
- conversational assistance through web and messaging channels

## Key Features

- Secure user registration, sign-in, and profile management
- SME loan application workflow with structured business and financial inputs
- Loan recommendation engine for eligibility checks and lender ranking
- EMI and affordability guidance for better financial planning
- Document upload, OCR processing, and AI-assisted document verification
- Application tracking from submission to final decision stages
- Administrative dashboards for users, banks, products, and audit activity
- AI chat support within the platform
- Messaging integration through WhatsApp and Telegram

## Technology Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- TanStack React Query

### Backend

- Node.js
- Express
- TypeScript

### Data and Platform Services

- Supabase for database, authentication, and storage

### AI and Intelligent Components

- TensorFlow.js for machine learning workflows
- Google Gemini for AI-assisted chat and document analysis
- OCR support through Tesseract, Azure Document Intelligence, or Google Vision

### Communication Channels

- Telegram Bot API
- WhatsApp Web
- Twilio WhatsApp integration

## High-Level System Modules

- **Applicant portal** for registration, profile management, and loan applications
- **Recommendation engine** for ranking suitable SME loan products
- **Document management module** for upload, readiness checks, and verification
- **Application tracker** for monitoring the progress of selected loan products
- **Admin portal** for managing banks, products, decisions, and system data
- **AI assistant layer** for chat, guidance, and messaging-based interaction

## Repository Structure

- `src/` - React frontend application
- `server/` - Express API and backend services
- `supabase/` - database migrations, policies, and seed files
- `scripts/` - utility and data preparation scripts
- `types/` - shared TypeScript domain types
- `public/` - static frontend assets
- `ml-artifacts/` - trained or generated machine learning artefacts

## Getting Started

### Prerequisites

- Node.js 24.x
- npm
- A configured Supabase project
- Optional API keys or provider credentials for AI, OCR, and messaging features

### Installation

```bash
npm install
```

Create a local environment file by copying `.env.example` to `.env`.

Then update `.env` with the required project settings. The full list of variables is documented in [`.env.example`](./.env.example).

### Run the Project

Start the frontend:

```bash
npm run dev
```

Start the backend API:

```bash
npm run server:dev
```

For a single backend start without watch mode:

```bash
npm start
```

## Useful Scripts

- `npm run dev` - start the Vite frontend
- `npm run server:dev` - start the backend in watch mode
- `npm start` - run the backend once
- `npm run build` - build the frontend for production
- `npm run lint` - run ESLint
- `npm test` - run automated tests
- `npm run typecheck:server` - type-check the backend code

## Configuration Notes

The application supports optional integrations for:

- OCR-based document reading
- AI-assisted document classification
- Telegram bot messaging
- WhatsApp messaging and voice-note handling
- cloud deployment through files already included in the repository

If these advanced features are not required, the project can still be run with the core frontend, backend, and Supabase configuration.

## Research and Development Focus

This project was developed to demonstrate how modern software engineering practices can be combined with AI-assisted services in a financial decision-support context. The implementation emphasises:

- usability for SME applicants
- explainable recommendation support
- modular full-stack architecture
- practical integration of AI and OCR services
- extensibility for future academic or industry research

## Disclaimer

LoanFlow is an academic research and software engineering project. It is intended for educational, demonstration, and evaluation purposes. It should not be treated as a replacement for formal credit assessment, regulatory review, or professional financial advice.

## Author

**Chamidu Dhilshan Kodithuwakkuarachchi**  
BSc Software Engineering  
Cardiff School of Technology  
Cardiff Metropolitan University  
March 2026

## License

This repository includes a [LICENSE](./LICENSE) file for the project codebase.
