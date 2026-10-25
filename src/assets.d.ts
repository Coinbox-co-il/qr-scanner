declare module '*qr-scanner-worker.min.js' {
    export function createWorker(): Promise<Worker>;
}
