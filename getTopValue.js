const crypto = require('crypto')
const Big = require('big.js');

Big.strict = true;
Big.RM = Big.roundDown;

const max_stop = Big('5000.0');
const house_factor = 25n;

function generate_stop_value(maxint) {
    const randint = crypto.randomBytes(8).readBigUInt64BE();

    const randint_dec = Big(randint.toString());
    const maxint_dec = Big(maxint.toString());

    if (randint % house_factor == 0n)
        return '1.00';

    const result = maxint_dec.div(randint_dec);

    if (result.gt(max_stop))
        return generate_stop_value();

    return result.toFixed(2);
}
/*
var int = 5n**32n - 564n;
var int2 = 23283064365386962890061;

console.log(int);
console.log(generate_stop_value(int));
*/
exports.calc = generate_stop_value;