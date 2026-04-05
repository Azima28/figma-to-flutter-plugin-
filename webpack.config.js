const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin');
const path = require('path');

module.exports = (env, argv) => ({
    mode: argv.mode === 'production' ? 'production' : 'development',
    devtool: argv.mode === 'production' ? false : 'inline-source-map',
    entry: {
        ui: './src/ui/ui.tsx',
        code: './src/plugin/controller.ts',
    },
    module: {
        rules: [
            { test: /\.tsx?$/, use: 'ts-loader', exclude: /node_modules/ },
            { test: /\.css$/, use: ['style-loader', 'css-loader'] },
        ],
    },
    resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js'] },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist'),
        // Figma needs a clean output without caching hashes if we strictly inline
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/ui/index.html',
            filename: 'ui.html',
            chunks: ['ui'],
            inject: 'body'
        }),
        new HtmlInlineScriptPlugin()
    ],
});
