/** Keep the script URL alive until the worker has actually loaded it. */
export default function createWorkerFromScript(script: string): Promise<Worker> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
        let worker: Worker;
        try { worker = new Worker(url); }
        catch (error) { URL.revokeObjectURL(url); reject(error); return; }

        const cleanUp = () => {
            clearTimeout(timeout);
            worker.removeEventListener('message', ready);
            worker.removeEventListener('error', failed);
            URL.revokeObjectURL(url);
        };
        const ready = ({ data }: MessageEvent) => {
            if (data.type !== 'ready') return;
            cleanUp(); resolve(worker);
        };
        const failed = (error: ErrorEvent) => {
            cleanUp(); worker.terminate(); reject(new Error(error.message || 'QR worker failed to start'));
        };
        const timeout = setTimeout(() => {
            cleanUp(); worker.terminate(); reject(new Error('QR worker startup timed out'));
        }, 10000);
        worker.addEventListener('message', ready);
        worker.addEventListener('error', failed);
    });
}
