module.exports = {
  multipass: true,
  plugins: [
    'preset-default',
    {
      name: 'removeViewBox',
      active: false,
    },
    'removeDimensions',
  ],
};
