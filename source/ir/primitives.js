/**
@fileOverview
Implementation of high-level IR instructions through handler functions

@author
Maxime Chevalier-Boisvert

@copyright
Copyright (c) 2010 Maxime Chevalier-Boisvert, All Rights Reserved
*/

// Make special functions for common utility code:
// TODO: BoxIsInt
// TODO: BoxIsDouble
// TODO: BoxIsString
// TODO: isGetterSetter?

// TODO: implement the following primitives
function make_clos() {}
function put_clos() {}
function get_clos() {}
function get_global() {}
function make_arg_obj() {}
function get_prop_val() {}
function put_prop_val() {}
function sub() {}
function mul() {}
function div() {}
function mod() {}
function eq() {}
function neq() {}

/**
Handler function for the HIR add instruction
*/
function add(v1, v2)
{
    // TODO: implement
}

/**
Handler for the HIR get_prop_val instruction
*/
function get_prop_val(obj, propName)
{
    // Compute the hash for the property
    // Boxed value, may be a string or an int
    var propHash = iir.unbox(IRType.INT32, computeHash(propName));

    // Until we reach the end of the prototype chain
    do
    {
        // Get a pointer to the object
        var objPtr = iir.unbox(IRType.OBJPTR, obj);

        // Get a pointer to the hash table
        var tblPtr = iir.load(IRType.OBJPTR, objPtr, OBJ_HASH_PTR_OFFSET);

        // Get the size of the hash table
        var tblSize = iir.load(IRType.INT32, objPtr, OBJ_HASH_SIZE_OFFSET);

        // Get the hash table index for this hash value
        var hashIndex = propHash % tblSize;

        // Until the key is found, or a free slot is encountered
        while (true)
        {
            // Get the key value at this hash slot
            var keyVal = iir.load(
                IRType.BOXED,
                tblPtr,
                hashIndex * OBJ_HASH_ENTRY_SIZE
            );

            // If this is the key we want
            if (keyVal === propName)
            {
                // Load the property value
                var propVal = load(
                    IRType.BOXED, 
                    tblPointer, 
                    hashIndex * OBJ_HASH_ENTRY_SIZE + OBJ_HASH_KEY_SIZE
                );

                if (isGetterSetter(propVal))
                    return callGetter(obj, propVal);
                else 
                    return propVal;
            }

            // Otherwise, if we have reached an empty slot
            else if (keyVal === OBJ_HASH_EMPTY_KEY)
            {
                break;
            }

            // Move to the next hash table slot
            hashIndex = (hashIndex + OBJ_HASH_ENTRY_SIZE) % tblSize;
        }

        // Move up in the prototype chain
        var obj = iir.load(IRType.BOXED, objPtr, OBJ_PROTO_PTR_OFFSET);

    } while (obj != null);

    // Property not found
    return undefined;
}
