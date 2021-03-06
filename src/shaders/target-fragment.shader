uniform vec2 u_resolution;
uniform vec3 u_color;
uniform float u_size;
uniform float u_scale;
uniform float u_thickness;

varying vec2 v_position;

#define PI 3.1415

float hue2rgb(float f1, float f2, float hue) {
    if (hue < 0.0)
        hue += 1.0;
    else if (hue > 1.0)
        hue -= 1.0;
    float res;
    if ((6.0 * hue) < 1.0)
        res = f1 + (f2 - f1) * 6.0 * hue;
    else if ((2.0 * hue) < 1.0)
        res = f2;
    else if ((3.0 * hue) < 2.0)
        res = f1 + (f2 - f1) * ((2.0 / 3.0) - hue) * 6.0;
    else
        res = f1;
    return res;
}

vec3 hsl2rgb(vec3 hsl) {
    vec3 rgb;

    if (hsl.y == 0.0) {
        rgb = vec3(hsl.z); // Luminance
    } else {
        float f2;

        if (hsl.z < 0.5)
        f2 = hsl.z * (1.0 + hsl.y);
        else
        f2 = hsl.z + hsl.y - hsl.y * hsl.z;

        float f1 = 2.0 * hsl.z - f2;

        rgb.r = hue2rgb(f1, f2, hsl.x + (1.0/3.0));
        rgb.g = hue2rgb(f1, f2, hsl.x);
        rgb.b = hue2rgb(f1, f2, hsl.x - (1.0/3.0));
    }
    return rgb;
}

void main() {
    vec2 p = v_position.xy / u_resolution;
    float offset = (1.0 - 1.0 / u_scale) / 2.0;
    float dx = min(p.x - offset, 1.0 - offset - p.x);
    float dy = min(p.y - offset, 1.0 - offset - p.y);
    if (0.0 <= dx && dx < smoothstep(1.0, 1.2, u_scale) * u_size && 0.0 <= dy && dy < smoothstep(1.0, 1.2, u_scale) * u_size && (dx < u_thickness || dy < u_thickness)) {
        gl_FragColor = vec4(u_color, 1.0);
    } else {
        gl_FragColor = vec4(1.0, 1.0, 1.0, 0.0);
    }
}
