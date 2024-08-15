import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()
        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})

        return {accessToken, refreshToken}

    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating token");
    }
}


const registerUser = asyncHandler(async(req, res) => {
    
    const {username,fullname, password } = req.body;
    console.log("fullname", fullname);

    if(
        [username, fullname, password].some((field) => field?.trim() === "")
    ){
        throw new ApiError(400, "All fields are required")
    }

    const existedUser = await User.findOne({
        $or: [{username}, {fullname}]
    })

    if(existedUser){
        throw new ApiError(409, "User with username already exist")
    }

    const user = await User.create({
        username,
        fullname,
        password,
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser){
        throw new ApiError(500,"Something went wrong while registering a user")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered Successfully")
    )

})

const loginUser = asyncHandler(async(req, res) => {
    const {username, password} = req.body;
    if(!username){
        throw new ApiError(400,"Username is required")
    }

    const user = await User.findOne({username})

    if(!user){
        throw new ApiError(404,"User not found")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid){
        throw new ApiError(401,"Invalid Password")
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200).cookie("accessToken", accessToken, options).cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(
        200,
        "User logged in Successfully"
    ))
})

const refreshAccessToken = asyncHandler(async(req, res) => {
    const incomingRefreshToken = req.cookie.refreshToken || req.body.refreshToken
    
    if(!incomingRefreshToken){
        throw new ApiError(401,"Unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
    
        const user =  await User.findById(decodedToken?._id)
    
        if(!user){
            throw new ApiError(401,"Invalid Refresh Token")
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401,"Refresh Token is expired")
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
        return res.status(200).cookie("accessToken", accessToken, options).cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(200, {accessToken, refreshToken, newRefreshToken}, "AccessToken refreshed Successfully")
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid Refresh Token")
    }

})

export {registerUser, loginUser, refreshAccessToken}