import jsQR from 'jsqr-es6';

type GrayscaleWeights = { red: number; green: number; blue: number; useIntegerApproximation: boolean };
let inversionAttempts: 'dontInvert' | 'onlyInvert' | 'attemptBoth' = 'dontInvert';
let grayscaleWeights: GrayscaleWeights = { red: 77, green: 150, blue: 29, useIntegerApproximation: true };
const scope = self as unknown as {
    onmessage: (event: MessageEvent) => void;
    postMessage: (message: unknown) => void;
    close: () => void;
};

scope.onmessage = ({ data: message }) => {
    switch (message.type) {
        case 'decode': {
            try {
                const image: ImageData = message.data;
                const result = jsQR(image.data, image.width, image.height, {
                    inversionAttempts, greyScaleWeights: grayscaleWeights,
                });
                scope.postMessage({
                    id: message.id, type: 'qrResult', data: result?.data ?? null,
                    cornerPoints: result ? [result.location.topLeftCorner, result.location.topRightCorner,
                        result.location.bottomRightCorner, result.location.bottomLeftCorner] : [],
                });
            } catch (error) {
                scope.postMessage({ id: message.id, type: 'qrError',
                    error: error instanceof Error ? error.message : String(error) });
            }
            break;
        }
        case 'grayscaleWeights': grayscaleWeights = message.data; break;
        case 'inversionMode':
            switch (message.data) {
                case 'original': inversionAttempts = 'dontInvert'; break;
                case 'invert': inversionAttempts = 'onlyInvert'; break;
                case 'both': inversionAttempts = 'attemptBoth'; break;
                default: throw new Error('Invalid inversion mode');
            }
            break;
        case 'close': scope.close(); break;
    }
};
scope.postMessage({ type: 'ready' });
