#pragma once
#include "iunknown.h"

namespace tsstg
{
    template<class T> class ObjectPtr;

    class Object : public virtual IUnknown
    {
        template<class T, class... Args> friend ObjectPtr<T> CreateObject(Args&&...);

        IMPL_IUNKNOWN_REFCOUNTER();

        IMPL_IUNKNOWN_QUERY_BEGIN();
        IMPL_IUNKNOWN_QUERY(IUnknown);
        IMPL_IUNKNOWN_QUERY_END();

    private:
        Object();
        Object(const Object&) = delete;
        Object(Object&&) = delete;
        Object& operator=(const Object&) = delete;
        Object& operator=(Object&&) = delete;
    };

    template<class T> class ObjectPtr
    {
        T* mPtr;

    public:
        ObjectPtr()
        {
            mPtr = nullptr;
        }

        ObjectPtr(T* ptr)
        {
            mPtr = ptr;
            if (mPtr)
            {
                mPtr->AddRef();
            }
        }

        template<typename TP, typename = typename std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        ObjectPtr(const ObjectPtr<TP>& val) noexcept
        {
            mPtr = val.Get();
            if (mPtr)
            {
                mPtr->AddRef();
            }
        }

        ObjectPtr(const ObjectPtr<T>& val) noexcept
        {
            mPtr = val.mPtr;
            if (mPtr)
            {
                mPtr->AddRef();
            }
        }

        ObjectPtr(ObjectPtr<T>&& val) noexcept
        {
            mPtr = val.mPtr;
            val.mPtr = nullptr;
        }

        ~ObjectPtr()
        {
            if (mPtr)
            {
                mPtr->Release();
            }
            mPtr = 0;
        }

        ObjectPtr<T>& operator=(const ObjectPtr<T>& val)
        {
            T* oldPtr = mPtr;
            mPtr = val.mPtr;
            if (mPtr)
            {
                mPtr->AddRef();
            }
            if (oldPtr)
            {
                oldPtr->Release();
            }
            return *this;
        }

        ObjectPtr<T>& operator=(T* val)
        {
            T* oldPtr = mPtr;
            mPtr = val;
            if (mPtr)
            {
                mPtr->AddRef();
            }
            if (oldPtr)
            {
                oldPtr->Release();
            }
            return *this;
        }

        friend bool operator!=(const ObjectPtr<T>& lhs, const ObjectPtr<T>& rhs)
        {
            return !(lhs.mPtr == rhs.mPtr);
        }

        friend bool operator!=(T* lhs, const ObjectPtr<T>& rhs)
        {
            return !(lhs == rhs.mPtr);
        }

        friend bool operator!=(const ObjectPtr<T>& lhs, T* rhs)
        {
            return !(lhs.mPtr == rhs);
        }

        friend bool operator==(const ObjectPtr<T>& lhs, T* rhs)
        {
            return lhs.mPtr == rhs;
        }

        friend bool operator==(T* lhs, const ObjectPtr<T>& rhs)
        {
            return lhs == rhs.mPtr;
        }

        friend bool operator==(const ObjectPtr<T>& lhs, const ObjectPtr<T>& rhs)
        {
            return (lhs.mPtr == rhs.mPtr);
        }

        friend bool operator<(const ObjectPtr<T>& lhs, const ObjectPtr<T>& rhs)
        {
            return (lhs.mPtr < rhs.mPtr);
        }

        inline T* operator->()
        {
            return mPtr;
        }

        inline bool IsValid() const
        {
            return mPtr != nullptr;
        }

        inline operator bool() const
        {
            return IsValid();
        }

        inline T* operator->() const
        {
            return mPtr;
        }

        inline operator T*()
        {
            return mPtr;
        }

        inline operator const void*() const = delete;

        inline operator const T*() const
        {
            return mPtr;
        }

        inline T* Get() const
        {
            return mPtr;
        }

        void Reset()
        {
            if (mPtr)
            {
                mPtr->Release();
            }
            mPtr = nullptr;
        }
    };

    template<class T, class... Args> ObjectPtr<T> CreateObject(Args&&... args)
    {
        return new T(std::forward<Args>(args)...);
    }
} // namespace tsstg