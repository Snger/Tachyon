/**
@fileOverview
Class hierarchy for Intermediate Representation (IR) instructions

@author
Maxime Chevalier-Boisvert

@copyright
Copyright (c) 2010 Maxime Chevalier-Boisvert, All Rights Reserved
*/

// TODO:
// May want MIR iflt, ifgt, ifeq, etc.
// May want specialized test for mask? intel test
// - Takes mask, compares result to 0
// - ifmask <mask> <value>, tests if result is value

// TODO:
// May want low-level load without masking
// - type, offset, index, multiplier
// Keep both load/store with and without mask
// - RawLoad? w/
//      - No masking,
//      - base_ptr + offset + index + multiplier

// TODO: separate instruction initFunc from validFunc?
// instr.validate()

//=============================================================================
//
// IR Core
//
// Implementation of the foundational logic of the IR instructions.
//
//=============================================================================

/**
@class IR type representation object
*/
function IRTypeObj(name, size)
{
    /**
    Name of this type
    @field
    */
    this.name = name;

    /**
    Type size in bytes
    @field
    */
    this.size = size;
}
IRTypeObj.prototype = {};

/**
Obtain a string representation of an IR type
*/
IRTypeObj.prototype.toString = function ()
{
    return this.name;
}

/**
Test if the type is a pointer type
*/
IRTypeObj.prototype.isPtrType = function ()
{
    switch (this)
    {
        case IRType.rptr:
        case IRType.box:
        return true;

        default:
        return false;
    }
}

/**
Test if the type is an integer type
*/
IRTypeObj.prototype.isIntType = function ()
{
    switch (this)
    {
        case IRType.u8:
        case IRType.u16:
        case IRType.u32:
        case IRType.u64:
        case IRType.i8:
        case IRType.i16:
        case IRType.i32:
        case IRType.i64:
        return true;

        default:
        return false;
    }
}

/**
Test if the type is a floating-point type
*/
IRTypeObj.prototype.isFPType = function ()
{
    switch (this)
    {
        case IRType.f64:
        return true;

        default:
        return false;
    }
}

/**
Test if the type is an integer or floating-point type
*/
IRTypeObj.prototype.isNumberType = function ()
{
    return this.isIntType() || this.isFPType();
}

// TODO: boxed and pointer type sizes are actually platform-dependent
// Need code get appropriate size for the platform

// Size of a pointer on the current platform
PLATFORM_PTR_SIZE = 8;

// IR value type enumeration
IRType =
{
    // Type given when there is no output value
    none:   new IRTypeObj('none', 0),

    // Boxed value type
    // Contains an immediate integer or an object pointer, and a tag
    box:    new IRTypeObj('box' , PLATFORM_PTR_SIZE),

    // Raw pointer to any memory address
    rptr:   new IRTypeObj('rptr', PLATFORM_PTR_SIZE),

    // Unboxed unsigned integer types
    u8:     new IRTypeObj('u8'  , 1),
    u16:    new IRTypeObj('u16' , 2),
    u32:    new IRTypeObj('u32' , 4),
    u64:    new IRTypeObj('u64' , 8),

    // Unboxed signed integer types
    i8:     new IRTypeObj('i8'  , 1),
    i16:    new IRTypeObj('i16' , 2),
    i32:    new IRTypeObj('i32' , 4),
    i64:    new IRTypeObj('i64' , 8),

    // Floating-point types
    f64:    new IRTypeObj('f64' , 8)
};

// If we are on a 32-bit platform
if (PLATFORM_PTR_SIZE == 4)
{
    // Int type of width corresponding a pointer on this platform
    IRType.pint = IRType.i32;

    // No support for 64-bit integer types on 32-bit platforms
    delete IRType.i64;
    delete IRType.u64;
}

// Otherwise, we are on a 64-bit platform
else
{
    // Int type of width corresponding a pointer on this platform
    IRType.pint = IRType.i64;
}

/**
@class Base class for all IR values
*/
function IRValue()
{
    /**
    Get a string representation of a value's name
    */
    this.getValName = function () { return 'value' };

    /**
    Produce a string representation of this value
    */
    this.toString = this.getValName;

    /**
    By default, all IR values have the boxed type
    */
    this.type = IRType.box;
}

/**
@class Represents constant values in the IR
@augments IRValue
*/
function ConstValue(value, type)
{
    // Ensure that the specified value is valid
    assert (
        !type.isIntType() || 
        (typeof value == 'number' && Math.floor(value) == value),
        'integer constants require integer values'
    );
    assert (
        !type.isFPType() || 
        (typeof value == 'number'),
        'floating-point constants require number values'
    );
    assert (
        (type === IRType.box) || (typeof value != 'string'),
        'string-valued constants must have box type'
    );

    /**
    Value of the constant
    @field
    */
    this.value = value;

    /**
    Type of the constant
    @field
    */
    this.type = type;
}
ConstValue.prototype = new IRValue();

/**
Get a string representation of a constant instruction
*/
ConstValue.prototype.toString = function ()
{
    if (typeof this.value == 'string')
    {
       return '"' + escapeJSString(this.value) + '"';
    }
    else if (this.value instanceof Function)
    {
        if (this.value.hasOwnProperty('name'))
            return this.value.name;
        else
            return 'function';
    }
    else
    {
        return String(this.value);
    }
};

/**
Get a string representation of an instruction's value/name.
Returns the constant's string representation directly.
*/
ConstValue.prototype.getValName = ConstValue.prototype.toString;

/**
Test if a constant is an integer
*/
ConstValue.prototype.isInt = function ()
{
    return (this.value == Math.floor(this.value));
}

/**
Test if a constant is a number
*/
ConstValue.prototype.isNumber = function ()
{
    return (typeof this.value == 'number');
}

/**
Test if a constant is the undefined constant
*/
ConstValue.prototype.isUndef = function ()
{
    return this.value === undefined;
}

/**
Map of values to maps of types to IR constants
*/
ConstValue.constMap = new HashMap();

/**
Get the unique constant instance for a given value
*/
ConstValue.getConst = function (value, type)
{
    // The default type is boxed
    if (type === undefined)
        type = IRType.box;

    // If there is no type map for this value
    if (!ConstValue.constMap.hasItem(value))
    {
        // Create a new hash map to map types to constants
        var typeMap = new HashMap();
        ConstValue.constMap.addItem(value, typeMap);
    }
    else
    {
        var typeMap = ConstValue.constMap.getItem(value);
    }

    // If there is no constant for this type
    if (!typeMap.hasItem(type))
    {
        // Create a new constant with the specified type
        var constant = new ConstValue(value, type);
        typeMap.addItem(type, constant);
    }
    else
    {
        var constant = typeMap.getItem(type);
    }

    // Return the constant
    return constant;
};

/**
@class Base class for all IR instructions
*/
function IRInstr()
{
    /**
    Test if this instruction's output is read (has uses)
    */
    this.hasDests = function () { return this.dests.length > 0; };

    /**
    Mnemonic name for this instruction    
    @field
    */
    this.mnemonic = '';

    /**
    Name of this instruction's output
    @field
    */
    this.outName = '';

    /**
    Id number for this instruction
    @field
    */
    this.instrId = 0;

    /**
    Values used/read by this instruction
    @field
    */
    this.uses = [];

    /**
    List of instructions reading this instruction's output
    @field
    */
    this.dests = [];

    /**
    Potential branch target basic blocks
    @field
    */
    this.targets = [];

    /**
    Flag to indicate that this instruction has side effects
    @field
    */
    this.sideEffects = false;

    /**
    Parent basic block
    @field
    */
    this.parentBlock = null;
}
IRInstr.prototype = new IRValue();

/**
Default output string formatting function
*/
IRInstr.defOutFormat = function (val)
{
    return val.type.name + ' ' + val.getValName();
}

/**
Default input string formatting function
*/
IRInstr.defInFormat = function (val)
{
    return val.getValName();
}

/**
Produce a string representation of this instruction
*/
IRInstr.prototype.toString = function (outFormatFn, inFormatFn)
{
    // If no formatting functions were specified, use the default ones
    if (!outFormatFn)
        outFormatFn = IRInstr.defOutFormat;
    if (!inFormatFn)
        inFormatFn = IRInstr.defInFormat;

    // Create a string for the output
    var output = "";

    // If this instruction has a non-void output print its output name
    if (this.type != IRType.none)
        output += outFormatFn(this) + ' = ';

    output += this.mnemonic;

    // For each use
    for (i = 0; i < this.uses.length; ++i)
    {
        var ins = this.uses[i];

        output += ' ';

        if (!(ins instanceof IRValue))
            output += '***invalid value***';
        else
            output += inFormatFn(ins);

        if (i != this.uses.length - 1)
            output += ",";
    }

    // For each branch target
    for (var i = 0; i < this.targets.length; ++i)
    {
        output += 
            (this.targetNames[i]? (' ' + this.targetNames[i]):'') + 
            ' ' + this.targets[i].getBlockName()
        ;
    }

    return output;
};

/**
Get a string representation of an instruction's value/name
*/
IRInstr.prototype.getValName = function ()
{
    // If the output name for this instruction is set
    if (this.outName)
    {
        // Return the output/temporary name
        return this.outName;
    }
    else
    {
        // Return a name based on the instruction id number
        return '$t_' + this.instrId;
    }
};

/**
Copy the instruction's generic properties
*/
IRInstr.prototype.baseCopy = function (newInstr)
{
    // Copy the mnemonic name
    newInstr.mnemonic = this.mnemonic;

    // Copy the output name
    newInstr.outName = this.outName;

    // Copy the instruction id
    newInstr.instrId = this.instrId;

    // The new instruction is orphaned
    newInstr.parentBlock = null;

    return newInstr;
};

/**
Replace a use
*/
IRInstr.prototype.replUse = function (oldUse, newUse)
{
    for (var i = 0; i < this.uses.length; ++i)
    {
        if (this.uses[i] === oldUse)
            this.uses[i] = newUse;
    }
};

/**
Add a new destination
*/
IRInstr.prototype.addDest = function (dest)
{
    if (this.dests.length == 0)
        this.dests = [dest];
    else
        arraySetAdd(this.dests, dest);
};

/**
Remove a destination
*/
IRInstr.prototype.remDest = function (dest)
{
    arraySetRem(this.dests, dest);
};

/**
Replace a destination
*/
IRInstr.prototype.replDest = function (oldDest, newDest)
{
    for (var i = 0; i < this.dests.length; ++i)
    {
        if (this.dests[i] === oldDest)
            this.dests[i] = newdest;
    }
};

/**
Returns a use iterator. Iterates through uses from left to right.
*/
IRInstr.prototype.getUseItr = function ()
{
    return new ArrayIterator(this.uses);
};

/**
Test if this instruction is a branch
*/
IRInstr.prototype.isBranch = function ()
{
    return (this.targets.length > 0);
}

/**
@class SSA phi node instruction
@augments IRInstr
*/
function PhiInstr(values, preds)
{
    // Ensure that each value has one associated predecessor
    assert (
        values.length == preds.length,
        'must have one predecessor for each phi use'
    );

    // Ensure that all values have the same type
    for (var i = 1; i < values.length; ++i)
    {
        assert (
            values[i].type === values[i-1].type,
            'all phi input values must have the same type'
        )
    }

    // Set the mnemonic name for this instruction
    this.mnemonic = "phi";

    /**
    Inputs to the phi node
    @field
    */
    this.uses = values;

    /**
    Immediate predecessor blocks associated with the uses
    @field
    */
    this.preds = preds;

    /**
    Phi node type, equal to the input values type
    @field
    */
    this.type = this.uses.length? this.uses[0].type:IRType.none;
}
PhiInstr.prototype = new IRInstr();

/**
Produce a string representation of the phi instruction
*/
PhiInstr.prototype.toString = function (outFormatFn, inFormatFn)
{
    // If no formatting functions were specified, use the default ones
    if (!outFormatFn)
        outFormatFn = IRInstr.defOutFormat;
    if (!inFormatFn)
        inFormatFn = IRInstr.defInFormat;

    var output = "";

    // If this instruction's type is not void, print its output name
    if (this.type != IRType.none)
        output += outFormatFn(this) + ' = ';

    output += this.mnemonic + ' ';

    for (i = 0; i < this.uses.length; ++i)
    {
        var ins = this.uses[i];
        var pred = this.preds[i];

        output += '[' + inFormatFn(ins) + ' ' + pred.getBlockName() + ']';

        if (i != this.uses.length - 1)
            output += ", ";
    }

    return output;
};

/**
Replace a predecessor block by another, keeping the corresponding use
*/
PhiInstr.prototype.replPred = function (oldPred, newPred)
{
    for (var i = 0; i < this.preds.length; ++i)
    {
        if (this.preds[i] === oldPred)
        {
            this.preds[i] = newPred;
            return;
        }
    }

    assert (
        false,
        'cannot replace pred, invalid pred'
    );
}

/**
Add an incoming value to a phi node
*/
PhiInstr.prototype.addIncoming = function (value, pred)
{
    assert (
        pred !== undefined,
        'must specify predecessor block'
    );

    // If there are already inputs
    if (this.uses.length)
    {
        assert (
            value.type === this.uses[0].type,
            'all phi inputs must have the same type'       
        );
    }
    else
    {
        // Set the phi node type
        this.type = value.type;
    }

    this.uses.push(value);
    this.preds.push(pred);

    if (value instanceof IRInstr)
        value.addDest(this);
};

/**
Get the input value for a given predecessor
*/
PhiInstr.prototype.getIncoming = function (pred)
{
    for (var i = 0; i < this.preds.length; ++i)
    {
        if (this.preds[i] === pred)
            return this.uses[i];
    }

    assert (
        false,
        'cannot get incoming for pred, invalid pred'
    );        
}

/**
Make a shallow copy of the instruction
*/
PhiInstr.prototype.copy = function ()
{
    return this.baseCopy(new PhiInstr(this.uses.slice(0), this.preds.slice(0)));
};

/**
@class Function argument value instruction
@augments IRInstr
*/
function ArgValInstr(type, argName, argIndex)
{
    // Set the mnemonic name for this instruction
    this.mnemonic = 'arg';

    // Set the output name as the argument name
    this.outName = argName;

    // Set the argument index
    this.argIndex = argIndex;

    // Set the argument type
    this.type = type; 
}
ArgValInstr.prototype = new IRInstr();

/**
Get a string representation of the argument instruction
*/
ArgValInstr.prototype.toString = function (outFormatFn, inFormatFn)
{
    // Get the default toString output for the instruction
    var output = IRInstr.prototype.toString.apply(this, outFormatFn, inFormatFn);

    // Add the argument index to the output
    output += ' ' + this.argIndex;

    return output;
}

/**
Make a shallow copy of the instruction
*/
ArgValInstr.prototype.copy = function ()
{
    return this.baseCopy(
        new ArgValInstr(
            this.type,
            this.outName,
            this.argIndex
        )
    );
};

/**
Function to generate instruction constructors using closures
@param mnemonic mnemonic name of the instruction
@param initFunc initialization and validation function
@param branchNames list of branch target names
@param protoObj prototype object for the instruction
@param nameFunc name setting function
*/
function instrMaker(
    mnemonic,
    initFunc,
    branchNames,
    protoObj
)
{
    /**
    Parse instruction constructor arguments
    */
    function parseArgs(argArray, typeParams, inputVals, branchTargets)
    {
        var curIndex = 0;

        // Extract type parameters, if any
        for (; curIndex < argArray.length && argArray[curIndex] instanceof IRTypeObj; ++curIndex)
            typeParams.push(argArray[curIndex]);

        // Extract input values, if any
        for (; curIndex < argArray.length && argArray[curIndex] instanceof IRValue; ++curIndex)
            inputVals.push(argArray[curIndex]);

        // Extract branch targets, if any
        for (; curIndex < argArray.length && argArray[curIndex] instanceof BasicBlock; ++curIndex)
            branchTargets.push(argArray[curIndex]);

        assert (
            curIndex == argArray.length,
            'invalid arguments passed to ' + mnemonic + ' constructor'
        );
    }

    /**
    Set the instruction name based on its type
    */
    function setName(typeParams, inputVals)
    {
        // If type parameters are provided
        if (typeParams.length > 0)
        {
            // Add the type parameters to the instruction name
            this.mnemonic = mnemonic;
            for (var j = 0; j < typeParams.length; ++j)
                this.mnemonic += '_' + typeParams[j];
        }

        // Otherwise, no type parameters are provided
        else
        {
            // Verify if all types in the specification are the same
            var firstType = inputVals.length? inputVals[0].type:null;
            var allSame = true;
            for (var j = 0; j < inputVals.length; ++j)
            {
                if (inputVals[j].type !== firstType)            
                    allSame = false;
            }

            // Set the initial mnemonic name
            this.mnemonic = mnemonic;

            // If all input types are the same
            if (allSame)
            {
                // If there is a first type and it is not boxed
                if (firstType !== null && firstType !== IRType.box)
                {
                    // Append the input type to the name
                    this.mnemonic += '_' + firstType.name;
                }
            }
            else
            {
                // Append all input types to the name
                for (var j = 0; j < inputVals.length; ++j)
                    this.mnemonic += '_' + inputVals[j].type;
            }
        }
    }

    /**
    Instruction constructor function instance, implemented as a closure
    */
    function InstrConstr(inputs)
    {
        // Parse the input arguments
        var typeParams = [];
        var inputVals = [];
        var branchTargets = [];
        if (inputs instanceof Array)
            parseArgs(inputs, typeParams, inputVals, branchTargets);
        else
            parseArgs(arguments, typeParams, inputVals, branchTargets);

        // Call the initialization and validation function
        try
        {
            this.initFunc(typeParams, inputVals, branchTargets);
        }

        // If an error occurs, rethrow it, including the instruction name
        catch (error)
        {
            var errorStr = 
                'Invalid arguments to "' + mnemonic + '" instruction: ' +
                error.toString()
            ;

            throw errorStr;
        }

        // If the mnemonic name is not set, call the name setting function
        if (this.mnemonic === '')
            setName.apply(this, [typeParams, inputVals]);

        // Store the type parameters of the instruction
        this.typeParams = typeParams;

        // Store the uses of the instruction
        this.uses = inputVals;

        // If this is a branch instruction
        if (branchNames)
        {
            // Store the branch targets
            this.targets = branchTargets;
        }
    }

    // If no prototype object was specified, create one
    if (!protoObj)
        protoObj = new IRInstr();

    // Set the prototype for the new instruction
    InstrConstr.prototype = protoObj;

    // Store the branch target names
    InstrConstr.prototype.targetNames = branchNames;

    // Store the initialization function
    if (initFunc)
        InstrConstr.prototype.initFunc = initFunc;

    /**
    Generic instruction shallow copy function
    */
    InstrConstr.prototype.copy = function ()
    {
        // Setup the copy arguments
        var copyArgs = [];
        copyArgs = copyArgs.concat(this.typeParams.slice(0));
        copyArgs = copyArgs.concat(this.uses.slice(0));
        if (this.targets) copyArgs = copyArgs.concat(this.targets.slice(0));

        // Return a new instruction with the same type parameters, uses and targets
        return this.baseCopy(new InstrConstr(copyArgs));
    };

    // Return the new constructor instance
    return InstrConstr;
}

/**
Function to validate the length of an input array
*/
instrMaker.validCount = function (name, array, minExpected, maxExpected)
{
    if (maxExpected === undefined)
        maxExpected = minExpected;

    var expectedStr;
    if (minExpected == maxExpected)
        expectedStr = String(minExpected);
    else if (maxExpected != Infinity)
        expectedStr = 'between ' + minExpected + ' and ' + maxExpected;
    else
        expectedStr = minExpected + ' or more'

    assert (
        array.length >= minExpected && array.length <= maxExpected,
        'got ' + array.length + ' ' +
        pluralize(name, array.length) + 
        ', expected ' + expectedStr
    );
}

/**
Function to validate the type paramers count of an instruction
*/
instrMaker.validNumParams = function (typeParams, minExpected, maxExpected)
{
    instrMaker.validCount('type parameter', typeParams, minExpected, maxExpected);
}

/**
Function to validate the argument count of an instruction
*/
instrMaker.validNumInputs = function (inputVals, minExpected, maxExpected)
{
    instrMaker.validCount('input value', inputVals, minExpected, maxExpected);
}

/**
Function to validate the branch targets of an instruction
*/
instrMaker.validNumBranches = function (branchTargets, minExpected, maxExpected)
{
    instrMaker.validCount('branch target', branchTargets, minExpected, maxExpected);
}

/**
Function to ensure that all values in an array are of boxed type
*/
instrMaker.allValsBoxed = function (inputVals)
{
    inputVals.forEach(
        function (val)
        {
            assert (
                val.type === IRType.box,
                'all input values must be boxed'
            );
        }
    );
}

/**
Function to ensure that all values in an array are of boxed type
*/
instrMaker.validType = function (value, expectedType)
{
    assert (
        value.type === expectedType,
        'got ' + value.type + ' value, expected ' + expectedType
    );
}

/**
Function to generate generic untyped instruction constructors using closures
@param mnemonic mnemonic name for the instruction
@param numInputs number of input operands
@param protoObj prototype object instance, new IRInstr instance by default
*/
function untypedInstrMaker(
    mnemonic, 
    numInputs, 
    branchNames,
    voidOutput,
    sideEffects,
    protoObj
)
{
    function initFunc(typeParams, inputVals, branchTargets)
    {
        instrMaker.validNumInputs(inputVals, numInputs);
        instrMaker.allValsBoxed(inputVals);

        assert (
            (branchTargets.length == 0 && !branchNames) ||
            (branchTargets.length == branchNames.length),
            'invalid number of branch targets specified'
        );

        this.type = voidOutput? IRType.none:IRType.box;

        this.sideEffects = (sideEffects !== undefined);
    }

    return instrMaker(
        mnemonic,
        initFunc,
        branchNames,
        protoObj,
        undefined
    );
}

//=============================================================================
//
// High-Level instructions, these operate only on boxed values
//
//=============================================================================

/**
@class Logical negation instruction
@augments IRInstr
*/
var LogNotInstr = untypedInstrMaker(
    'not',
     1
);

/**
@class Type query instruction
@augments IRInstr
*/
var TypeOfInstr = untypedInstrMaker(
    'typeof',
     1
);

/**
@class Instance/class query instruction
@augments IRInstr
*/
var InstOfInstr = untypedInstrMaker(
    'instanceof',
     2
);

/**
@class Exception value catch
@augments IRInstr
*/
var CatchInstr = untypedInstrMaker(
    'catch',
     0
);

/**
@class Property test with value for field name
@augments IRInstr
*/
var HasPropValInstr = untypedInstrMaker(
    'has_prop_val',
     2
);

/**
@class Instruction to get an array containing the property names of an object
@augments IRInstr
*/
var GetPropNamesInstr = untypedInstrMaker(
    'get_prop_names',
     1
);

/**
@class Property deletion with value for field name
@augments IRInstr
*/
var DelPropValInstr = untypedInstrMaker(
    'del_prop_val',
     2,
    undefined,
    true,
    true
);

/**
@class Argument object creation
@augments IRInstr
*/
var MakeArgObjInstr = untypedInstrMaker(
    'make_arg_obj',
     1
);

/**
@class Mutable cell creation
@augments IRInstr
*/
var MakeCellInstr = untypedInstrMaker(
    'make_cell',
     0
);

/**
@class Get the value stored in a mutable cell
@augments IRInstr
*/
var GetCellInstr = untypedInstrMaker(
    'get_cell',
     1
);

/**
@class Set the value stored in a mutable cell
@augments IRInstr
*/
var PutCellInstr = untypedInstrMaker(
    'put_cell',
     2,
    undefined,
    true,
    true
);

/**
@class Closure creation with closure variable arguments
@augments IRInstr
*/
var MakeClosInstr = instrMaker(
    'make_clos',
    function (typeParams, inputVals, branchTargets)
    {
        instrMaker.allValsBoxed(inputVals);
        instrMaker.validNumInputs(inputVals, 1, Infinity);
        assert(
            inputVals[0] instanceof IRFunction,
            'expected function as first argument'
        );
    }
);

/**
@class Get the value stored in a closure variable
@augments IRInstr
*/
var GetClosInstr = untypedInstrMaker(
    'get_clos',
     2
);

/**
@class Set the value stored in a closure variable
@augments IRInstr
*/
var PutClosInstr = untypedInstrMaker(
   'put_clos',
    3,
    undefined,
    true,
    true
);

/**
@class Instruction to create a new, empty object
@augments IRInstr
*/
var NewObjectInstr = untypedInstrMaker(
    'new_object',
     1
);

/**
@class Instruction to create a new, empty array
@augments IRInstr
*/
var NewArrayInstr = untypedInstrMaker(
    'new_array',
     0
);

//=============================================================================
//
// Arithmetic operations without overflow handling
//
//=============================================================================

/**
@class Base class for arithmetic instructions
@augments IRInstr
*/
ArithInstr = function ()
{
}
ArithInstr.prototype = new IRInstr();

/**
Default initialization function for arithmetic instructions
*/
ArithInstr.prototype.initFunc = function (typeParams, inputVals, branchTargets)
{
    instrMaker.validNumInputs(inputVals, 2);

    assert (
        (inputVals[0].type === IRType.box ||
         inputVals[0].type.isNumberType())
        &&
        inputVals[1].type === inputVals[0].type,
        'invalid input types'
    );
    
    this.type = inputVals[0].type;
}

/**
@class Addition instruction
@augments ArithInstr
*/
var AddInstr = instrMaker(
    'add',
    function (typeParams, inputVals, branchTargets)
    {
        instrMaker.validNumInputs(inputVals, 2);

        assert (
            (inputVals[0].type === IRType.rptr &&
             inputVals[1].type === IRType.pint)
            ||
            (
                (inputVals[0].type === IRType.box ||
                 inputVals[0].type.isNumberType())
                &&
                inputVals[1].type === inputVals[0].type
            ),
            'invalid input types'
        );
        
        this.type = inputVals[0].type;
    },
    undefined,
    new ArithInstr()
);

/**
@class Subtraction instruction
@augments ArithInstr
*/
var SubInstr = instrMaker(
    'sub',
    function (typeParams, inputVals, branchTargets)
    {
        instrMaker.validNumInputs(inputVals, 2);

        assert (
            (inputVals[0].type === IRType.rptr &&
             inputVals[1].type === IRType.pint)
            ||
            (inputVals[0].type === IRType.rptr &&
             inputVals[1].type === IRType.rptr)
            ||
            (
                (inputVals[0].type === IRType.box ||
                 inputVals[0].type.isNumberType())
                &&
                inputVals[1].type === inputVals[0].type
            ),
            'invalid input types'
        );
        
        if (
            inputVals[0].type === IRType.rptr && 
            inputVals[1].type === IRType.rptr
        )
            this.type = IRType.pint
        else
            this.type = inputVals[0].type;
    },
    undefined,
    new ArithInstr()
);

/**
@class Multiplication instruction
@augments ArithInstr
*/
var MulInstr = instrMaker(
    'mul',
    undefined,
    undefined,
    new ArithInstr()
);

/**
@class Division instruction
@augments ArithInstr
*/
var DivInstr = instrMaker(
    'div',
    undefined,
    undefined,
    new ArithInstr()
);

/**
@class Modulo instruction
@augments ArithInstr
*/
var ModInstr = instrMaker(
    'mod',
    undefined,
    undefined,
    new ArithInstr()
);

//=============================================================================
//
// Arithmetic operations with overflow handling
//
//=============================================================================

/**
@class Base class for arithmetic instructions with overflow handling
@augments IRInstr
*/
ArithOvfInstr = function ()
{
}
ArithOvfInstr.prototype = new IRInstr();

/**
Default initialization function for arithmetic instructions w/ overflow
*/
ArithOvfInstr.prototype.initFunc = function (typeParams, inputVals, branchTargets)
{
    instrMaker.validNumInputs(inputVals, 2);
    assert (
        (inputVals[0].type === IRType.pint &&
         inputVals[1].type === inputVals[0].type)
        ||
        (inputVals[0].type === IRType.box &&
         inputVals[1].type === inputVals[0].type),
        'invalid input types'
    );
    
    this.type = inputVals[0].type;
}

/**
@class Instruction to add integer values with overflow handling
@augments ArithOvfInstr
*/
var AddOvfInstr = instrMaker(
    'add_ovf',
    undefined,
    ['normal', 'overflow'],
    new ArithOvfInstr()
);

/**
@class Instruction to subtract integer values with overflow handling
@augments ArithOvfInstr
*/
var SubOvfInstr = instrMaker(
    'sub_ovf',
    undefined,
    ['normal', 'overflow'],
    new ArithOvfInstr()
);

/**
@class Instruction to multiply integer values with overflow handling
@augments ArithOvfInstr
*/
var MulOvfInstr = instrMaker(
    'mul_ovf',
    undefined,
    ['normal', 'overflow'],
    new ArithOvfInstr()
);

//=============================================================================
//
// Bitwise operations
//
//=============================================================================

/**
@class Base class for bitwise operation instructions
@augments IRInstr
*/
BitOpInstr = function ()
{
}
BitOpInstr.prototype = new IRInstr();

/**
Default initialization function for bitwise operation instructions
*/
BitOpInstr.prototype.initFunc = function (typeParams, inputVals, branchTargets)
{
    instrMaker.validNumInputs(inputVals, 2);

    assert (
        (
            inputVals[0].type === IRType.box
            &&
            (inputVals[1].type === IRType.box ||
            inputVals[1].type === IRType.pint)
        )
        ||
        (inputVals[0].type.isIntType() &&
         inputVals[1].type === inputVals[0].type),
        'invalid input types'
    );
    
    this.type = inputVals[1].type;
}

/**
@class Bitwise NOT instruction
@augments BitOpInstr
*/
var NotInstr = instrMaker(
    'not',
    function (typeParams, inputVals, branchTargets)
    {
        instrMaker.validNumInputs(inputVals, 1);

        assert (
            (inputVals[0].type === IRType.box ||
            inputVals[0].type.isIntType()),
            'invalid input type'
        );
        
        this.type = inputVals[0].type;
    },
    undefined,
    new BitOpInstr()
);

/**
@class Bitwise AND instruction
@augments BitOpInstr
*/
var AndInstr = instrMaker(
    'and',
    undefined,
    undefined,
    new BitOpInstr()
);

/**
@class Bitwise OR instruction
@augments BitOpInstr
*/
var OrInstr = instrMaker(
    'or',
    undefined,
    undefined,
    new BitOpInstr()
);

/**
@class Bitwise XOR instruction
@augments BitOpInstr
*/
var XorInstr = instrMaker(
    'xor',
    undefined,
    undefined,
    new BitOpInstr()
);

/**
@class Left shift instruction
@augments BitOpInstr
*/
var LsftInstr = instrMaker(
    'lsft',
    undefined,
    undefined,
    new BitOpInstr()
);

/**
@class Right shift instruction
@augments BitOpInstr
*/
var RsftInstr = instrMaker(
    'rsft',
    undefined,
    undefined,
    new BitOpInstr()
);

/**
@class Unsigned right shift instruction
@augments BitOpInstr
*/
var UrsftInstr = instrMaker(
    'ursft',
    undefined,
    undefined,
    new BitOpInstr()
);

//=============================================================================
//
// Comparison instructions
//
//=============================================================================

/**
@class Base class for comparison instructions
@augments IRInstr
*/
CompInstr = function ()
{
}
CompInstr.prototype = new IRInstr();

/**
Default initialization function for comparison instructions
*/
CompInstr.prototype.initFunc = function (typeParams, inputVals, branchTargets)
{
    instrMaker.validNumInputs(inputVals, 2);

    assert (
        (inputVals[0].type === IRType.box ||
         inputVals[0].type.isNumberType())
        &&
        inputVals[1].type === inputVals[0].type,
        'invalid input types'
    );
    
    if (inputVals[0].type === IRType.box)
        this.type = IRType.box;
    else
        this.type = IRType.i8;
}

/**
@class Less-than comparison instruction
@augments CompInstr
*/
var LtInstr = instrMaker(
    'lt',
    undefined,
    undefined,
    new CompInstr()
);

/**
@class Less-than-or-equal comparison instruction
@augments CompInstr
*/
var LteInstr = instrMaker(
    'lte',
    undefined,
    undefined,
    new CompInstr()
);

/**
@class Greater-than comparison instruction
@augments CompInstr
*/
var GtInstr = instrMaker(
    'gt',
    undefined,
    undefined,
    new CompInstr()
);

/**
@class Greater-than-or-equal comparison instruction
@augments CompInstr
*/
var GteInstr = instrMaker(
    'gte',
    undefined,
    undefined,
    new CompInstr()
);

/**
@class Equality comparison instruction
@augments CompInstr
*/
var EqInstr = instrMaker(
    'eq',
    undefined,
    undefined,
    new CompInstr()
);

/**
@class Inequality comparison instruction
@augments CompInstr
*/
var NeqInstr = instrMaker(
    'neq',
    undefined,
    undefined,
    new CompInstr()
);

/**
@class Strict-equality comparison instruction
@augments CompInstr
*/
var SeqInstr = untypedInstrMaker(
    'seq',
     2,
    undefined,
    false,
    new CompInstr()
);

/**
@class Strict-inequality comparison instruction
@augments CompInstr
*/
var NseqInstr = untypedInstrMaker(
    'nseq',
     2,
    undefined,
    false,
    new CompInstr()
);

//=============================================================================
//
// Branching instructions
//
//=============================================================================

/**
@class Unconditional jump instruction
@augments IRInstr
*/
var JumpInstr = untypedInstrMaker(
    'jump',
     0,
    [undefined],
    true
);

/**
@class Function return instruction
@augments IRInstr
*/
var RetInstr = instrMaker(
    'ret',
    function (typeParams, inputVals, branchTargets)
    {
        instrMaker.validNumInputs(inputVals, 1);
        
        this.type = IRType.none;
    }
);

/**
Ret instructions are always branch instructions
*/
RetInstr.prototype.isBranch = function ()
{
    return true;
}

/**
@class If branching instruction
@augments IRInstr
*/
var IfInstr = instrMaker(
    'if',
    function (typeParams, inputVals, branchTargets)
    {
        instrMaker.validNumInputs(inputVals, 1);
        assert (
            inputVals[0].type === IRType.box ||
            inputVals[0].type === IRType.i8,
            'input must be boxed or int8'
        );
        instrMaker.validNumBranches(branchTargets, 2);
        
        this.type = IRType.none;
    },
    ['then', 'else']
);

//=============================================================================
//
// Exception-producing and call instructions
//
//=============================================================================

/**
@class Base class for exception-producing instructions
@augments IRInstr
*/
ExceptInstr = function ()
{
}
ExceptInstr.prototype = new IRInstr();

/**
Set the target block of the exception-producing instruction
*/
ExceptInstr.prototype.setThrowTarget = function (catchBlock)
{
    this.targets[0] = catchBlock;
}

/**
Get the target block of the exception-producing instruction
*/
ExceptInstr.prototype.getThrowTarget = function ()
{
    return this.targets[0]? this.targets[0]:null;
}

/**
@class Exception throw to exception handler. Handler may be left undefined for
interprocedural throw.
@augments ExceptInstr
*/
var ThrowInstr = instrMaker(
    'throw',
    function (typeParams, inputVals, branchTargets)
    {
        instrMaker.validNumInputs(inputVals, 1);
        instrMaker.validType(inputVals[0], IRType.box);
        instrMaker.validNumBranches(branchTargets, 0, 1);
        
        this.type = IRType.none;
    },
    ['to'],
    new ExceptInstr()
);

/**
Throw instructions are always branch instructions
*/
ThrowInstr.prototype.isBranch = function ()
{
    return true; 
}

/**
@class Base class for call instructions
@augments ExceptInstr
*/
CallInstr = function ()
{
}
CallInstr.prototype = new ExceptInstr();

/**
By default, conservatively assume that all calls have side effects
*/
CallInstr.prototype.sideEffects = true;

/**
Set the continue block of the call instruction
*/
CallInstr.prototype.setContTarget = function (contBlock)
{
    this.targets[0] = contBlock;

    while (!this.targets[this.targets.length-1])
        this.targets.pop();
}

/**
Get the continuation target block of the call instruction
*/
CallInstr.prototype.getContTarget = function ()
{
    return (this.targets.length > 0)? this.targets[0]:null;
}

/**
Set the throw target block of the call instruction
*/
CallInstr.prototype.setThrowTarget = function (catchBlock)
{
    this.targets = catchBlock? [this.targets[0], catchBlock]:[this.targets[0]];

    while (!this.targets[this.targets.length-1])
        this.targets.pop();
}

/**
Get the throw target block of the call instruction
*/
CallInstr.prototype.getThrowTarget = function ()
{
    return (this.targets.length > 1)? this.targets[1]:null;
}

/**
@class Function call instruction
@augments CallInstr
*/
var CallFuncInstr = instrMaker(
    undefined,
    function (typeParams, inputVals, branchTargets)
    {
        this.mnemonic = 'call';

        instrMaker.validNumInputs(inputVals, 2, Infinity);
        instrMaker.validType(inputVals[0], IRType.box);
        instrMaker.validType(inputVals[1], IRType.box);
        instrMaker.validNumBranches(branchTargets, 0, 2);

        if (inputVals[0].retType instanceof IRTypeObj)
            this.type = inputVals[0].retType;
        else
            this.type = IRType.box;
    },
    ['continue', 'throw'],
    new CallInstr()
);

/**
@class Constructor call with function object reference
@augments CallInstr
*/
var ConstructInstr = instrMaker(
    undefined,
    function (typeParams, inputVals, branchTargets)
    {
        this.mnemonic = 'construct';

        instrMaker.validNumInputs(inputVals, 2, Infinity);
        instrMaker.validType(inputVals[0], IRType.box);
        instrMaker.validType(inputVals[1], IRType.box);
        instrMaker.validNumBranches(branchTargets, 0, 2);
        
        this.type = IRType.box;
    },
    ['continue', 'throw'],
    new CallInstr()
);

/**
@class Property set with value for field name
@augments CallInstr
*/
var PutPropValInstr = instrMaker(
    'put_prop_val',
    function (typeParams, inputVals, branchTargets)
    {
        instrMaker.validNumInputs(inputVals, 3);
        instrMaker.validType(inputVals[0], IRType.box);
        instrMaker.validType(inputVals[1], IRType.box);
        instrMaker.validType(inputVals[2], IRType.box);
        instrMaker.validNumBranches(branchTargets, 0, 2);
        
        this.type = IRType.none;
    },
    ['continue', 'throw'],
    new CallInstr()
);

/**
@class Property get with value for field name
@augments CallInstr
*/
var GetPropValInstr = instrMaker(
    'get_prop_val',
    function (typeParams, inputVals, branchTargets)
    {
        instrMaker.validNumInputs(inputVals, 2);
        instrMaker.validType(inputVals[0], IRType.box);
        instrMaker.validType(inputVals[1], IRType.box);
        instrMaker.validNumBranches(branchTargets, 0, 2);
        
        this.type = IRType.box;
    },
    ['continue', 'throw'],
    new CallInstr()
);

//=============================================================================
//
// Type conversion instructions
//
//=============================================================================

/**
@class Instruction to unbox a value
@augments IRInstr
*/
var UnboxInstr = instrMaker(
    'unbox',
    function (typeParams, inputVals, branchTargets)
    {
        instrMaker.validNumParams(typeParams, 1);
        instrMaker.validNumInputs(inputVals, 1);
        assert (
            typeParams[0] === IRType.pint,
            'type parameter should be platform int'
        );
        instrMaker.validType(inputVals[0], IRType.box);
        
        this.type = typeParams[0];
    }
);

/**
@class Instruction to box a value
@augments IRInstr
*/
var BoxInstr = instrMaker(
    'box',
    function (typeParams, inputVals, branchTargets)
    {
        instrMaker.validNumParams(typeParams, 1);
        instrMaker.validNumInputs(inputVals, 1);
        assert (
            typeParams[0] === IRType.pint,
            'type parameter should be platform int'
        );
        instrMaker.validType(inputVals[0], typeParams[0]);

        this.type = IRType.box;
    }
);

/**
@class Instruction to convert between different integer types
@augments IRInstr
*/
var ICastInstr = instrMaker(
    'icast',
    function (typeParams, inputVals, branchTargets)
    {
        instrMaker.validNumParams(typeParams, 1);
        instrMaker.validNumInputs(inputVals, 1);
        assert (
            (inputVals[0].type.isIntType() || 
             inputVals[0].type === IRType.box ||
             inputVals[0].type === IRType.rptr) 
            &&
            (typeParams[0].isIntType() ||
             typeParams[0] === IRType.box ||
             typeParams[0] === IRType.rptr),
            'type parameters must be integer or raw pointer'
        );
        
        this.type = typeParams[0];
    }
);

/**
@class Instruction to convert integer values to floating-point
@augments IRInstr
*/
var IToFPInstr = instrMaker(
    'itof',
    function (typeParams, inputVals, branchTargets)
    {
        instrMaker.validNumParams(inputVals, 1);
        instrMaker.validNumInputs(inputVals, 1);
        assert (
            inputVals[0].type === IRType.pint &&
            typeParams[0] === IRType.f64,
            'invalid type parameters'
        );
        
        this.type = typeParams[0];
    }
);

/**
@class Instruction to convert floating-point values to integer
@augments IRInstr
*/
var FPToIInstr = instrMaker(
    'ftoi',
    function (typeParams, inputVals, branchTargets)
    {
        instrMaker.validNumParams(inputVals, 1);
        instrMaker.validNumInputs(inputVals, 1);
        assert (
            typeParams[0].type === IRType.f64 &&
            typeParams[0] === IRType.pint,
            'invalid type parameters'
        );
        
        this.type = typeParams[0];
    }
);

//=============================================================================
//
// Memory access instructions
//
//=============================================================================

/**
@class Instruction to load a value from memory
@augments IRInstr
*/
var LoadInstr = instrMaker(
    'load',
    function (typeParams, inputVals, branchTargets)
    {
        instrMaker.validNumParams(typeParams, 1);
        instrMaker.validNumInputs(inputVals, 2);
        assert (
            inputVals[0].type.isPtrType(),
            'the first input must be a pointer'
        );
        instrMaker.validType(inputVals[1], IRType.pint);
        
        this.type = typeParams[0];
    }
);

/**
@class Instruction to store a value to memory
@augments IRInstr
*/
var StoreInstr = instrMaker(
    'store',
    function (typeParams, inputVals, branchTargets)
    {
        instrMaker.validNumParams(typeParams, 1);
        instrMaker.validNumInputs(inputVals, 3);
        assert (
            inputVals[0].type.isPtrType(),
            'the first input must be a pointer'
        );
        instrMaker.validType(inputVals[1], IRType.pint);
        instrMaker.validType(inputVals[2], typeParams[0]);
        
        this.type = IRType.none;

        this.sideEffects = true;
    }
);

/**
@class Instruction to get a pointer to the current runtime context
@augments IRInstr
*/
var GetCtxInstr = instrMaker(
    'get_ctx',
    function (typeParams, inputVals, branchTargets)
    {
        instrMaker.validNumInputs(inputVals, 0);
        
        this.type = IRType.rptr;
    }
);

/**
@class Instruction to set the runtime context pointer
@augments IRInstr
*/
var SetCtxInstr = instrMaker(
    'set_ctx',
    function (typeParams, inputVals, branchTargets)
    {
        instrMaker.validNumInputs(inputVals, 1);
        instrMaker.validType(inputVals[0], IRType.rptr);
        
        this.type = IRType.none;

        this.sideEffects = true;
    }
);

//=============================================================================
//
// Low-Level IR instructions (LIR)
//
//=============================================================================

/**
@class Move a value between two registers or between a register and a memory 
       location. This kind of LIR instruction should only appear after 
       register allocation.
@augments IRInstr
*/
function MoveInstr(from, to)
{
    // Set the mnemonic name for this instruction
    this.mnemonic = "move";

    /**
    Inputs to the move instruction
    @field
    */
    this.uses = [from, to];
}
MoveInstr.prototype = new IRInstr();

/**
Produce a string representation of the move instruction
*/
MoveInstr.prototype.toString = function ()
{
    var output = "";

    output += this.mnemonic + ' ';

    for (i = 0; i < this.uses.length; ++i)
    {
        output += this.uses[i];

        if (i != this.uses.length - 1)
        {
            output += ", ";
        }
    }

    return output;
};

