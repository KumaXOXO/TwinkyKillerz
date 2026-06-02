import Phaser from 'phaser';

const fragShader = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTime;
varying vec2 outTexCoord;

void main()
{
    vec2 uv = outTexCoord;

    // Barrel Distortion
    vec2 center = vec2(0.5, 0.5);
    vec2 offCenter = uv - center;
    float dist = dot(offCenter, offCenter);
    uv = center + offCenter * (1.0 + dist * 0.05);

    // RGB Shift
    float shift = 0.0015;
    vec4 texR = texture2D(uMainSampler, uv + vec2(shift, 0.0));
    vec4 texG = texture2D(uMainSampler, uv);
    vec4 texB = texture2D(uMainSampler, uv - vec2(shift, 0.0));
    vec4 color = vec4(texR.r, texG.g, texB.b, 1.0);

    // Scanlines
    float scanline = sin(uv.y * 800.0) * 0.04;
    color.rgb -= scanline;

    // Vignette
    float vignette = 1.0 - smoothstep(0.4, 0.6, length(offCenter));
    color.rgb *= (0.8 + 0.2 * vignette);

    // Flicker
    float flicker = 1.0 + sin(uTime * 100.0) * 0.005;
    color.rgb *= flicker;

    gl_FragColor = color;
}
`;

export class CRTPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
    constructor(game: Phaser.Game) {
        super({
            game,
            name: 'CRTPipeline',
            fragShader
        });
    }

    onPreRender() {
        this.set1f('uTime', this.game.loop.time / 1000);
    }
}
